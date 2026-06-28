"""
Adaptive Rescheduling System
Handles: feedback learning loop, FSRS updates, session quality scoring,
confidence decay, burnout detection, dynamic schedule adjustments.
"""
from datetime import datetime, timedelta
from models import get_db, rows_to_list, row_to_dict
from scheduler import compute_priority_score, run_fsrs_after_feedback, maybe_adjust_effective_difficulty
import math


# ─────────────────────────────────────────────────────────────────────────────
# SESSION QUALITY SCORE
# ─────────────────────────────────────────────────────────────────────────────

def compute_session_quality(confidence_rating, difficulty_feedback, actual_minutes, planned_minutes):
    """
    quality = (confidence_rating/5 × 0.5)
            + ((5 - difficulty_rating)/4 × 0.3)
            + (min(actual, planned)/planned × 0.2)
    difficulty_feedback maps: 1=Easy, 2=Medium, 3=Hard, 4=Very Hard
    """
    # Clamp inputs
    conf = max(1, min(5, confidence_rating or 3))
    diff = max(1, min(4, difficulty_feedback or 2))
    actual = max(0, actual_minutes or 0)
    planned = max(1, planned_minutes or 60)

    q = (
        (conf / 5.0) * 0.5
        + ((5 - diff) / 4.0) * 0.3
        + (min(actual, planned) / planned) * 0.2
    )
    return round(max(0.0, min(1.0, q)), 4)


# ─────────────────────────────────────────────────────────────────────────────
# CONFIDENCE DECAY (per-topic, daily)
# ─────────────────────────────────────────────────────────────────────────────

def apply_confidence_decay(user_id):
    """
    For every topic belonging to user's subjects, apply daily confidence decay:
        confidence = confidence × exp(-decay_rate × days_since_studied)
    """
    db = get_db()
    c = db.cursor()
    today = datetime.now().date()

    topics = rows_to_list(c.execute('''
        SELECT t.id, t.confidence, t.last_studied, t.decay_rate
        FROM topics t
        JOIN subjects s ON t.subject_id = s.id
        WHERE s.user_id = ?
    ''', (user_id,)).fetchall())

    for topic in topics:
        confidence = topic.get('confidence') or 0.7
        last_studied = topic.get('last_studied')
        decay_rate = topic.get('decay_rate') or 0.05

        if last_studied:
            try:
                last_dt = datetime.strptime(last_studied, '%Y-%m-%d').date()
                days_since = max((today - last_dt).days, 0)
            except Exception:
                days_since = 0
        else:
            days_since = 0

        new_confidence = confidence * math.exp(-decay_rate * days_since)
        new_confidence = max(0.0, min(1.0, new_confidence))

        c.execute(
            'UPDATE topics SET confidence = ? WHERE id = ?',
            (round(new_confidence, 4), topic['id'])
        )

    db.commit()
    db.close()


def get_topics_with_confidence(user_id):
    """Return all topics for a user with their current decayed confidence."""
    db = get_db()
    c = db.cursor()
    topics = rows_to_list(c.execute('''
        SELECT t.*, s.name as subject_name
        FROM topics t
        JOIN subjects s ON t.subject_id = s.id
        WHERE s.user_id = ?
        ORDER BY t.confidence ASC
    ''', (user_id,)).fetchall())
    db.close()
    return topics


# ─────────────────────────────────────────────────────────────────────────────
# BURNOUT DETECTION
# ─────────────────────────────────────────────────────────────────────────────

def detect_burnout(user_id):
    """
    Check for burnout signals:
      a) 3+ consecutive skipped/missed sessions
      b) quality_score declining for 5+ days straight
      c) avg daily hours this week < 50% of avg daily hours last week
    Returns { detected, reason, triggered_at }
    """
    db = get_db()
    c = db.cursor()
    today = datetime.now().date()

    # ── (a) 3+ consecutive skipped/missed ──
    recent_sessions = rows_to_list(c.execute('''
        SELECT status FROM session_logs
        WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 10
    ''', (user_id,)).fetchall())

    consecutive_bad = 0
    for s in recent_sessions:
        if s['status'] in ('skipped', 'missed'):
            consecutive_bad += 1
        else:
            break
    if consecutive_bad >= 3:
        db.close()
        return {
            'detected': True,
            'reason': f'{consecutive_bad} consecutive skipped/missed sessions detected.',
            'triggered_at': today.strftime('%Y-%m-%d'),
        }

    # ── (b) quality declining 5+ days ──
    daily_qualities = []
    for i in range(4, -1, -1):  # last 5 days
        day = (today - timedelta(days=i)).strftime('%Y-%m-%d')
        row = c.execute('''
            SELECT AVG(quality_score) as avg_q FROM session_logs
            WHERE user_id = ? AND date = ? AND quality_score IS NOT NULL
        ''', (user_id, day)).fetchone()
        avg_q = row['avg_q'] if row and row['avg_q'] is not None else None
        daily_qualities.append(avg_q)

    valid_qualities = [q for q in daily_qualities if q is not None]
    if len(valid_qualities) >= 5:
        declining = all(
            valid_qualities[i] > valid_qualities[i + 1]
            for i in range(len(valid_qualities) - 1)
        )
        if declining:
            db.close()
            return {
                'detected': True,
                'reason': 'Quality score has been declining for 5+ consecutive days.',
                'triggered_at': today.strftime('%Y-%m-%d'),
            }

    # ── (c) avg hours this week < 50% last week ──
    def avg_hours(days_ago_start, n_days):
        total = 0.0
        for i in range(n_days):
            day = (today - timedelta(days=days_ago_start + i)).strftime('%Y-%m-%d')
            row = c.execute(
                'SELECT SUM(hours_studied) as h FROM session_logs WHERE user_id = ? AND date = ?',
                (user_id, day)
            ).fetchone()
            total += row['h'] if row and row['h'] else 0.0
        return total / n_days

    this_week_avg = avg_hours(0, 7)
    last_week_avg = avg_hours(7, 7)
    if last_week_avg > 0 and this_week_avg < 0.5 * last_week_avg:
        db.close()
        return {
            'detected': True,
            'reason': f'Average daily hours this week ({this_week_avg:.1f}h) is less than 50% of last week ({last_week_avg:.1f}h).',
            'triggered_at': today.strftime('%Y-%m-%d'),
        }

    db.close()
    return {
        'detected': False,
        'reason': '',
        'triggered_at': None,
    }


def save_burnout_status(user_id, burnout_info):
    """Persist burnout detection result to database."""
    db = get_db()
    c = db.cursor()
    c.execute('''
        INSERT INTO burnout_log (user_id, detected, reason, triggered_at)
        VALUES (?, ?, ?, ?)
    ''', (
        user_id,
        1 if burnout_info['detected'] else 0,
        burnout_info.get('reason', ''),
        burnout_info.get('triggered_at'),
    ))
    db.commit()
    db.close()


# ─────────────────────────────────────────────────────────────────────────────
# PROCESS FEEDBACK
# ─────────────────────────────────────────────────────────────────────────────

def process_task_feedback(task_id, status, difficulty_feedback, hours_studied=None,
                          notes='', confidence_rating=None):
    """
    Process user feedback for a completed/skipped task.
    Updates subject priority, FSRS fields, session quality, completion rate,
    effective difficulty, topic confidence, and logs the session.
    """
    db = get_db()
    c = db.cursor()

    task = row_to_dict(c.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone())
    if not task:
        db.close()
        return {'error': 'Task not found'}

    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')

    # Update task status
    c.execute(
        'UPDATE tasks SET status = ?, difficulty_feedback = ? WHERE id = ?',
        (status, difficulty_feedback, task_id)
    )

    # Compute session quality
    planned_minutes = round((task.get('duration_hours') or 1.0) * 60)
    actual_minutes = round((hours_studied or (task['duration_hours'] if status == 'completed' else 0)) * 60)

    # difficulty_feedback (1-5 scale from old system) → map to 1-4 scale for quality
    diff_for_quality = min(4, max(1, difficulty_feedback or 2))
    conf_rating = confidence_rating or 3

    quality = compute_session_quality(conf_rating, diff_for_quality, actual_minutes, planned_minutes)

    # Use task's scheduled_date so analytics attribute hours to the correct day.
    # Fall back to today only if scheduled_date is missing.
    log_date = task.get('scheduled_date') or now.strftime('%Y-%m-%d')

    # Log the session with quality
    c.execute('''
        INSERT INTO session_logs
            (user_id, task_id, subject_id, date, hours_studied, status,
             difficulty_feedback, notes, quality_score, confidence_rating)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        task['user_id'], task_id, task['subject_id'],
        log_date,
        hours_studied or (task['duration_hours'] if status == 'completed' else 0),
        status, difficulty_feedback, notes, quality, conf_rating
    ))

    # Also store quality on the task itself
    c.execute('UPDATE tasks SET quality_score = ?, confidence_rating = ? WHERE id = ?',
              (quality, conf_rating, task_id))

    subject = row_to_dict(c.execute('SELECT * FROM subjects WHERE id = ?', (task['subject_id'],)).fetchone())

    if status == 'completed':
        hours_to_add = hours_studied or task['duration_hours']
        new_total = subject['total_hours_spent'] + hours_to_add

        prof_delta = 0
        if difficulty_feedback == 5:
            prof_delta = -0.2
        elif difficulty_feedback == 1:
            prof_delta = 0.2
        elif difficulty_feedback == 2:
            prof_delta = 0.1

        new_proficiency = max(1, min(5, subject['proficiency'] + prof_delta))

        old_rate = subject.get('completion_rate', 1.0)
        new_rate = min(1.0, old_rate * 0.8 + 0.2)

        c.execute('''
            UPDATE subjects SET total_hours_spent = ?, proficiency = ?, completion_rate = ?
            WHERE id = ?
        ''', (new_total, new_proficiency, new_rate, subject['id']))

        # Update topic confidence if a topic was assigned
        if task.get('topic_id'):
            c.execute('''
                UPDATE topics SET confidence = MIN(1.0, confidence + 0.1), last_studied = ?
                WHERE id = ?
            ''', (today_str, task['topic_id']))

    elif status in ('skipped', 'missed'):
        old_rate = subject.get('completion_rate', 1.0)
        new_rate = max(0.0, old_rate * 0.8)
        c.execute('UPDATE subjects SET completion_rate = ? WHERE id = ?', (new_rate, subject['id']))
        _reschedule_missed_task(c, task, subject)

    # Run FSRS update
    run_fsrs_after_feedback(c, task['subject_id'], status, today_str)

    # Dynamic difficulty adjustment (every 3 sessions)
    maybe_adjust_effective_difficulty(c, task['subject_id'])

    # Recompute priority score for the subject
    updated_subject = row_to_dict(c.execute('SELECT * FROM subjects WHERE id = ?', (task['subject_id'],)).fetchone())
    new_score = compute_priority_score(
        updated_subject['proficiency'],
        updated_subject.get('difficulty', 3),
        updated_subject.get('exam_date'),
        updated_subject.get('completion_rate', 1.0),
        task.get('rescheduled_count', 0),
        updated_subject.get('stability', 1.0),
        updated_subject.get('last_review'),
        updated_subject.get('effective_difficulty'),
    )
    c.execute('UPDATE subjects SET priority_score = ? WHERE id = ?', (new_score, subject['id']))

    db.commit()
    db.close()
    return {
        'success': True,
        'new_priority': new_score,
        'quality_score': quality,
    }


def _reschedule_missed_task(cursor, task, subject):
    """Reschedule a missed/skipped task to the next day with boosted priority."""
    original_date = datetime.strptime(task['scheduled_date'], '%Y-%m-%d').date()
    next_date = original_date + timedelta(days=1)

    today = datetime.now().date()
    if next_date < today:
        next_date = today + timedelta(days=1)

    reschedule_count = task.get('rescheduled_count', 0) + 1
    boosted_priority = min(10.0, task['priority_score'] + 1.5)

    cursor.execute('''
        INSERT INTO tasks (user_id, subject_id, topic_id, scheduled_date, scheduled_time,
                           duration_hours, status, priority_score, rescheduled_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        task['user_id'], task['subject_id'], task['topic_id'],
        next_date.strftime('%Y-%m-%d'), task['scheduled_time'],
        task['duration_hours'], 'pending', boosted_priority, reschedule_count
    ))


# ─────────────────────────────────────────────────────────────────────────────
# DAILY ADAPTIVE UPDATE (called on login)
# ─────────────────────────────────────────────────────────────────────────────

def run_adaptive_update(user_id):
    """
    Daily adaptive update: auto-mark missed tasks, adjust priorities,
    apply confidence decay, detect burnout.
    """
    db = get_db()
    c = db.cursor()
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')

    missed = rows_to_list(c.execute('''
        SELECT * FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'pending'
    ''', (user_id, yesterday)).fetchall())

    for task in missed:
        c.execute("UPDATE tasks SET status = 'missed' WHERE id = ?", (task['id'],))
        subject = row_to_dict(c.execute('SELECT * FROM subjects WHERE id = ?', (task['subject_id'],)).fetchone())
        if subject:
            old_rate = subject.get('completion_rate', 1.0)
            new_rate = max(0.0, old_rate * 0.75)
            c.execute('UPDATE subjects SET completion_rate = ? WHERE id = ?', (new_rate, subject['id']))
            _reschedule_missed_task(c, task, subject)

    db.commit()
    db.close()

    # Apply confidence decay to all topics for this user
    apply_confidence_decay(user_id)

    # Detect & save burnout
    burnout_info = detect_burnout(user_id)
    save_burnout_status(user_id, burnout_info)

    return {
        'missed_auto_rescheduled': len(missed),
        'burnout': burnout_info,
    }


# ─────────────────────────────────────────────────────────────────────────────
# INSIGHTS
# ─────────────────────────────────────────────────────────────────────────────

def get_insights(user_id):
    """Generate actionable insights based on performance data."""
    db = get_db()
    c = db.cursor()

    subjects = rows_to_list(c.execute(
        'SELECT * FROM subjects WHERE user_id = ?', (user_id,)
    ).fetchall())

    insights = []
    recommendations = []

    for subj in subjects:
        name = subj['name']
        completion = subj.get('completion_rate', 1.0)
        proficiency = subj['proficiency']
        priority = subj.get('priority_score', 5.0)
        hours = subj.get('total_hours_spent', 0.0)

        if proficiency <= 2:
            insights.append({
                'type': 'warning',
                'subject': name,
                'message': f'Low proficiency detected in {name}. Increase focus immediately.',
                'icon': '⚠️',
                'severity': 'warning',
            })
            recommendations.append(f'Revise {name} daily this week')

        elif proficiency == 3 and completion < 0.6:
            insights.append({
                'type': 'caution',
                'subject': name,
                'message': f'Inconsistent progress in {name}. Complete missed sessions.',
                'icon': '📉',
                'severity': 'caution',
            })

        if completion > 0.85 and proficiency >= 4:
            insights.append({
                'type': 'success',
                'subject': name,
                'message': f'Excellent performance in {name}! Keep it up.',
                'icon': '🌟',
                'severity': 'success',
            })

        if subj['exam_date']:
            try:
                exam_dt = datetime.strptime(subj['exam_date'], '%Y-%m-%d')
                days_left = (exam_dt - datetime.now()).days
                if 0 < days_left <= 7:
                    insights.append({
                        'type': 'urgent',
                        'subject': name,
                        'message': f'{name} exam in {days_left} day(s)! Switch to revision mode.',
                        'icon': '🔥',
                        'severity': 'urgent',
                    })
                    recommendations.append(f'Focus on high-weight {name} topics for next {days_left} days')
            except Exception:
                pass

        if completion < 0.5:
            insights.append({
                'type': 'warning',
                'subject': name,
                'message': f'Low completion rate ({int(completion*100)}%) in {name}.',
                'icon': '📊',
                'severity': 'warning',
            })
            recommendations.append(f'Increase {name} study hours')

        # Goal at-risk insight
        if subj.get('target_date'):
            try:
                target_dt = datetime.strptime(subj['target_date'], '%Y-%m-%d').date()
                days_left = (target_dt - datetime.now().date()).days
                target_prof = subj.get('target_proficiency') or 0.85
                current_norm = proficiency / 5.0
                if current_norm < target_prof and days_left <= 14:
                    insights.append({
                        'type': 'warning',
                        'subject': name,
                        'message': f'{name} goal at risk! {days_left} days left, current proficiency {int(current_norm*100)}%.',
                        'icon': '🎯',
                        'severity': 'warning',
                    })
            except Exception:
                pass

    type_order = {'urgent': 0, 'warning': 1, 'caution': 2, 'success': 3}
    insights.sort(key=lambda x: type_order.get(x['type'], 4))

    db.close()
    return {
        'insights': insights[:8],
        'recommendations': recommendations[:5],
    }
