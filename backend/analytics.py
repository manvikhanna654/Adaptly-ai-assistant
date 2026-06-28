"""
Analytics Engine
Generates charts data, performance trends, history, and quality metrics.
"""
from datetime import datetime, timedelta
from models import get_db, rows_to_list, row_to_dict
from collections import defaultdict


def get_analytics(user_id):
    db = get_db()
    c = db.cursor()

    # --- Subject-wise time distribution ---
    subjects = rows_to_list(c.execute(
        'SELECT id, name, total_hours_spent, priority_score, proficiency, completion_rate, exam_date FROM subjects WHERE user_id = ?',
        (user_id,)
    ).fetchall())

    subject_time = [
        {'name': s['name'], 'hours': round(s['total_hours_spent'], 2),
         'priority': round(s.get('priority_score', 0), 1),
         'proficiency': s['proficiency'],
         'completion_rate': round(s.get('completion_rate', 1.0) * 100)}
        for s in subjects
    ]

    # --- Weekly completion trend (last 14 days) ---
    today = datetime.now().date()
    trend_data = []
    for i in range(13, -1, -1):
        day = today - timedelta(days=i)
        day_str = day.strftime('%Y-%m-%d')
        tasks_day = rows_to_list(c.execute(
            "SELECT status FROM tasks WHERE user_id = ? AND scheduled_date = ?",
            (user_id, day_str)
        ).fetchall())
        total = len(tasks_day)
        completed = sum(1 for t in tasks_day if t['status'] == 'completed')
        skipped = sum(1 for t in tasks_day if t['status'] in ('skipped', 'missed'))
        trend_data.append({
            'date': day_str,
            'label': day.strftime('%b %d'),
            'total': total,
            'completed': completed,
            'skipped': skipped,
            'rate': round((completed / total * 100) if total > 0 else 0, 1)
        })

    # --- Daily hours studied (last 91 days for heatmap) ---
    hours_trend = []
    for i in range(90, -1, -1):
        day = today - timedelta(days=i)
        day_str = day.strftime('%Y-%m-%d')
        row = c.execute(
            'SELECT SUM(hours_studied) as total FROM session_logs WHERE user_id = ? AND date = ?',
            (user_id, day_str)
        ).fetchone()
        hours = row['total'] if row and row['total'] else 0
        hours_trend.append({
            'date': day_str,
            'label': day.strftime('%a'),
            'hours': round(hours, 2)
        })

    # --- Overall stats ---
    total_tasks = c.execute('SELECT COUNT(*) FROM tasks WHERE user_id = ?', (user_id,)).fetchone()[0]
    completed_tasks = c.execute(
        "SELECT COUNT(*) FROM tasks WHERE user_id = ? AND status = 'completed'", (user_id,)
    ).fetchone()[0]
    skipped_tasks = c.execute(
        "SELECT COUNT(*) FROM tasks WHERE user_id = ? AND status IN ('skipped', 'missed')", (user_id,)
    ).fetchone()[0]
    total_hours = c.execute(
        'SELECT SUM(hours_studied) FROM session_logs WHERE user_id = ?', (user_id,)
    ).fetchone()[0] or 0

    # --- Streak calculation ---
    streak = 0
    for i in range(0, 60):
        day = today - timedelta(days=i)
        had_completed = c.execute(
            "SELECT COUNT(*) FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'",
            (user_id, day.strftime('%Y-%m-%d'))
        ).fetchone()[0]
        if had_completed > 0:
            streak += 1
        else:
            if i > 0:
                break

    # --- Session quality metrics ---
    # avg_quality_score across all sessions
    avg_quality_row = c.execute(
        'SELECT AVG(quality_score) as avg_q FROM session_logs WHERE user_id = ? AND quality_score IS NOT NULL',
        (user_id,)
    ).fetchone()
    avg_quality = round(avg_quality_row['avg_q'], 4) if avg_quality_row and avg_quality_row['avg_q'] is not None else None

    # quality_trend — last 14 daily averages
    quality_trend = []
    for i in range(13, -1, -1):
        day = today - timedelta(days=i)
        day_str = day.strftime('%Y-%m-%d')
        row = c.execute(
            'SELECT AVG(quality_score) as avg_q FROM session_logs WHERE user_id = ? AND date = ? AND quality_score IS NOT NULL',
            (user_id, day_str)
        ).fetchone()
        q = round(row['avg_q'], 4) if row and row['avg_q'] is not None else None
        quality_trend.append({
            'date': day_str,
            'label': day.strftime('%b %d'),
            'avg_quality': q,
        })

    db.close()

    return {
        'subject_time': subject_time,
        'trend': trend_data,
        'hours_trend': hours_trend,
        'stats': {
            'total_tasks': total_tasks,
            'completed_tasks': completed_tasks,
            'skipped_tasks': skipped_tasks,
            'completion_rate': round((completed_tasks / total_tasks * 100) if total_tasks > 0 else 0, 1),
            'total_hours': round(total_hours, 1),
            'streak': streak,
            'avg_quality_score': avg_quality,
        },
        'quality_trend': quality_trend,
    }


def get_history(user_id, limit=50):
    db = get_db()
    c = db.cursor()
    logs = rows_to_list(c.execute('''
        SELECT sl.*, s.name as subject_name, t.duration_hours
        FROM session_logs sl
        JOIN subjects s ON sl.subject_id = s.id
        LEFT JOIN tasks t ON sl.task_id = t.id
        WHERE sl.user_id = ?
        ORDER BY sl.created_at DESC
        LIMIT ?
    ''', (user_id, limit)).fetchall())
    db.close()
    return logs
