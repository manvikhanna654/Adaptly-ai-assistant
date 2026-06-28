"""
AI Scheduling Engine
Generates personalized study schedules using FSRS-based priority scoring.
Includes: FSRS spaced repetition, goal-based planning, dynamic difficulty adjustment.
"""
from datetime import datetime, timedelta
from models import get_db, rows_to_list, row_to_dict
import math


# ─────────────────────────────────────────────────────────────────────────────
# FSRS — Free Spaced Repetition Scheduler (lightweight manual implementation)
# ─────────────────────────────────────────────────────────────────────────────

def fsrs_retrievability(stability, delta_days):
    """Probability of recall: R = exp(-Δt / S)"""
    if stability <= 0:
        stability = 1.0
    return math.exp(-delta_days / stability)


def fsrs_update(stability, retrievability, correct: bool):
    """
    Update stability after a review.
    correct=True  → new_S = S × exp(0.9 × (1 - R))
    correct=False → new_S = S × 0.2
    """
    if correct:
        new_stability = stability * math.exp(0.9 * (1.0 - retrievability))
    else:
        new_stability = stability * 0.2
    return max(new_stability, 0.1)


def fsrs_next_review_days(new_stability):
    """Days until next review = ceil(S × 2.5)"""
    return max(1, math.ceil(new_stability * 2.5))


def run_fsrs_after_feedback(cursor, subject_id, status, today_str):
    """
    After a feedback submission, update the FSRS fields for the subject.
    status: 'completed' = correct; 'skipped'/'missed' = wrong
    """
    subject = row_to_dict(
        cursor.execute('SELECT * FROM subjects WHERE id = ?', (subject_id,)).fetchone()
    )
    if not subject:
        return

    stability = subject.get('stability') or 1.0
    last_review = subject.get('last_review')
    today = datetime.strptime(today_str, '%Y-%m-%d').date()

    if last_review:
        try:
            last_dt = datetime.strptime(last_review, '%Y-%m-%d').date()
            delta_days = max((today - last_dt).days, 1)
        except Exception:
            delta_days = 1
    else:
        delta_days = 1

    retrievability = fsrs_retrievability(stability, delta_days)
    correct = (status == 'completed')
    new_stability = fsrs_update(stability, retrievability, correct)
    next_days = fsrs_next_review_days(new_stability)
    next_review = (today + timedelta(days=next_days)).strftime('%Y-%m-%d')
    new_count = (subject.get('review_count') or 0) + 1

    cursor.execute('''
        UPDATE subjects
        SET stability = ?, last_review = ?, next_review = ?, review_count = ?
        WHERE id = ?
    ''', (new_stability, today_str, next_review, new_count, subject_id))


# ─────────────────────────────────────────────────────────────────────────────
# DYNAMIC DIFFICULTY ADJUSTMENT
# ─────────────────────────────────────────────────────────────────────────────

def maybe_adjust_effective_difficulty(cursor, subject_id):
    """
    After every 3 sessions for a subject, recalculate effective_difficulty
    based on average quality score of last 3 sessions.
    """
    recent = rows_to_list(cursor.execute('''
        SELECT quality_score FROM session_logs
        WHERE subject_id = ? AND quality_score IS NOT NULL
        ORDER BY created_at DESC LIMIT 3
    ''', (subject_id,)).fetchall())

    if len(recent) < 3:
        return  # not enough data yet

    avg_q = sum(r['quality_score'] for r in recent) / 3.0
    subject = row_to_dict(
        cursor.execute('SELECT * FROM subjects WHERE id = ?', (subject_id,)).fetchone()
    )
    if not subject:
        return

    eff_diff = subject.get('effective_difficulty') or subject.get('difficulty') or 3.0

    if avg_q > 0.75:
        eff_diff = max(1.0, eff_diff - 0.5)
    elif avg_q < 0.4:
        eff_diff = min(5.0, eff_diff + 0.5)

    cursor.execute(
        'UPDATE subjects SET effective_difficulty = ? WHERE id = ?',
        (eff_diff, subject_id)
    )


# ─────────────────────────────────────────────────────────────────────────────
# PRIORITY SCORE — now uses FSRS urgency + effective difficulty
# ─────────────────────────────────────────────────────────────────────────────

def compute_priority_score(
    proficiency, difficulty, exam_date_str,
    completion_rate=1.0, rescheduled_count=0,
    stability=1.0, last_review=None,
    effective_difficulty=None
):
    """
    Priority Score Formula (0-10 scale):
    - Weakness factor : lower proficiency = higher priority
    - Urgency factor  : FSRS-based retrievability (1 - R  → higher forgetting = higher urgency)
    - Difficulty factor: uses effective_difficulty if available
    - Missed tasks    : rescheduled tasks get boosted priority
    - Completion rate : lower completion = higher priority
    """
    # Weakness factor (1-5 scale, inverted so lower proficiency = higher score)
    weakness = (6 - proficiency) / 5.0  # 0.2 to 1.0

    # Use effective difficulty if set, fall back to raw difficulty
    eff_diff = effective_difficulty if effective_difficulty is not None else difficulty
    diff_factor = eff_diff / 5.0  # 0.2 to 1.0

    # ── FSRS urgency: 1 - retrievability ──
    today = datetime.now().date()
    if last_review:
        try:
            last_dt = datetime.strptime(last_review, '%Y-%m-%d').date()
            delta_days = max((today - last_dt).days, 1)
        except Exception:
            delta_days = 1
    else:
        delta_days = 1  # never reviewed → assume 1 day elapsed

    retrievability = fsrs_retrievability(stability or 1.0, delta_days)
    urgency = 1.0 - retrievability  # clipped naturally to [0, 1)

    # Also factor in exam date for a secondary urgency boost
    exam_urgency = 0.0
    if exam_date_str:
        try:
            exam_date = datetime.strptime(exam_date_str, '%Y-%m-%d')
            days_until = (exam_date - datetime.now()).days
            if days_until <= 0:
                exam_urgency = 1.0
            elif days_until <= 3:
                exam_urgency = 0.95
            elif days_until <= 7:
                exam_urgency = 0.85
            elif days_until <= 14:
                exam_urgency = 0.7
            elif days_until <= 30:
                exam_urgency = 0.55
            else:
                exam_urgency = 0.3
        except Exception:
            exam_urgency = 0.0

    # Blend FSRS urgency with exam urgency
    urgency = max(urgency, exam_urgency * 0.5)

    # Completion rate penalty
    completion_penalty = 1.0 - (completion_rate * 0.3)

    # Reschedule boost
    reschedule_boost = min(rescheduled_count * 0.1, 0.3)

    # Weighted aggregate score
    score = (
        weakness * 3.0 +
        urgency * 3.5 +
        diff_factor * 2.0 +
        completion_penalty * 1.0 +
        reschedule_boost * 0.5
    )

    return round(min(score * 10 / 10.0, 10.0), 2)


# ─────────────────────────────────────────────────────────────────────────────
# GOAL LAYER
# ─────────────────────────────────────────────────────────────────────────────

def compute_goal_info(subject, daily_hours):
    """
    Compute goal gap, required daily hours, and at_risk flag for a subject.
    Returns a dict with keys: goal_gap, required_daily_hours, at_risk
    """
    target_prof = subject.get('target_proficiency') or 0.85
    target_date_str = subject.get('target_date')
    current_prof = (subject.get('proficiency') or 3) / 5.0  # normalize to 0-1

    gap = max(0.0, target_prof - current_prof)
    required_daily = 0.0
    at_risk = False

    if target_date_str:
        try:
            target_dt = datetime.strptime(target_date_str, '%Y-%m-%d').date()
            days_left = (target_dt - datetime.now().date()).days
            if days_left > 0:
                required_daily = round((gap * 10) / days_left, 2)
                at_risk = required_daily > daily_hours
            else:
                at_risk = gap > 0.0
        except Exception:
            pass

    return {
        'goal_gap': round(gap, 3),
        'required_daily_hours': required_daily,
        'at_risk': at_risk,
    }


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULE GENERATION
# ─────────────────────────────────────────────────────────────────────────────

def generate_schedule(user_id, days=7):
    """
    Generate a study schedule for the next `days` days.
    Returns a list of task dicts to be inserted into the DB.
    """
    db = get_db()
    c = db.cursor()

    user = row_to_dict(c.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone())
    if not user:
        db.close()
        return []

    daily_hours = user.get('daily_hours', 4.0)
    peak_time = user.get('peak_time', 'morning')

    subjects = rows_to_list(c.execute(
        'SELECT * FROM subjects WHERE user_id = ?', (user_id,)
    ).fetchall())

    if not subjects:
        db.close()
        return []

    # Compute/update priority scores using FSRS
    for subj in subjects:
        score = compute_priority_score(
            subj['proficiency'],
            subj.get('difficulty', 3),
            subj.get('exam_date'),
            subj.get('completion_rate', 1.0),
            0,
            subj.get('stability', 1.0),
            subj.get('last_review'),
            subj.get('effective_difficulty'),
        )
        subj['priority_score'] = score
        c.execute(
            'UPDATE subjects SET priority_score = ? WHERE id = ?',
            (score, subj['id'])
        )

    db.commit()

    subjects.sort(key=lambda x: x['priority_score'], reverse=True)

    TIME_SLOTS = {
        'morning': ['07:00', '08:00', '09:00', '10:00'],
        'afternoon': ['13:00', '14:00', '15:00', '16:00'],
        'evening': ['18:00', '19:00', '20:00', '21:00'],
        'night': ['21:00', '22:00', '23:00', '00:00'],
    }
    preferred_slots = TIME_SLOTS.get(peak_time, TIME_SLOTS['morning'])

    tasks_to_create = []
    today = datetime.now().date()

    for day_offset in range(days):
        sched_date = today + timedelta(days=day_offset)
        sched_date_str = sched_date.strftime('%Y-%m-%d')

        existing = c.execute(
            'SELECT COUNT(*) as cnt FROM tasks WHERE user_id = ? AND scheduled_date = ?',
            (user_id, sched_date_str)
        ).fetchone()
        if existing and existing['cnt'] > 0:
            continue

        total_score = sum(s['priority_score'] for s in subjects) or 1
        hours_remaining = daily_hours
        slot_idx = 0

        exam_mode = any(
            s['exam_date'] and
            (datetime.strptime(s['exam_date'], '%Y-%m-%d').date() - sched_date).days <= 7
            for s in subjects if s['exam_date']
        )

        for subj in subjects:
            if hours_remaining <= 0:
                break

            weight = subj['priority_score'] / total_score
            allocated = round(weight * daily_hours, 1)
            allocated = min(allocated, hours_remaining)
            allocated = max(allocated, 0.5)

            if exam_mode and subj['priority_score'] > 7:
                allocated = min(allocated * 1.3, hours_remaining)

            topics = rows_to_list(c.execute(
                'SELECT * FROM topics WHERE subject_id = ? AND completed = 0', (subj['id'],)
            ).fetchall())

            time_slot = preferred_slots[slot_idx % len(preferred_slots)]
            slot_idx += 1

            task = {
                'user_id': user_id,
                'subject_id': subj['id'],
                'topic_id': topics[0]['id'] if topics else None,
                'scheduled_date': sched_date_str,
                'scheduled_time': time_slot,
                'duration_hours': allocated,
                'status': 'pending',
                'priority_score': subj['priority_score'],
            }
            tasks_to_create.append(task)
            hours_remaining -= allocated

    for t in tasks_to_create:
        c.execute('''
            INSERT INTO tasks (user_id, subject_id, topic_id, scheduled_date, scheduled_time,
                               duration_hours, status, priority_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            t['user_id'], t['subject_id'], t['topic_id'],
            t['scheduled_date'], t['scheduled_time'],
            t['duration_hours'], t['status'], t['priority_score']
        ))

    db.commit()
    db.close()
    return tasks_to_create


# ─────────────────────────────────────────────────────────────────────────────
# TODAY's SCHEDULE — includes goal info + burnout flag from adaptive
# ─────────────────────────────────────────────────────────────────────────────

def get_todays_schedule(user_id):
    db = get_db()
    c = db.cursor()
    today = datetime.now().strftime('%Y-%m-%d')

    user = row_to_dict(c.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone())
    daily_hours = user.get('daily_hours', 4.0) if user else 4.0

    tasks = rows_to_list(c.execute('''
        SELECT t.*, s.name as subject_name, s.priority_score as subject_priority,
               s.target_proficiency, s.target_date, s.proficiency,
               s.stability, s.last_review,
               tp.name as topic_name
        FROM tasks t
        JOIN subjects s ON t.subject_id = s.id
        LEFT JOIN topics tp ON t.topic_id = tp.id
        WHERE t.user_id = ? AND t.scheduled_date = ?
        ORDER BY t.priority_score DESC, t.scheduled_time
    ''', (user_id, today)).fetchall())

    # Attach goal info to each task
    for task in tasks:
        goal = compute_goal_info(task, daily_hours)
        task['goal_gap'] = goal['goal_gap']
        task['required_daily_hours'] = goal['required_daily_hours']
        task['at_risk'] = goal['at_risk']

    db.close()
    return tasks


def get_weekly_schedule(user_id):
    db = get_db()
    c = db.cursor()
    today = datetime.now().date()
    week_end = today + timedelta(days=7)

    tasks = rows_to_list(c.execute('''
        SELECT t.*, s.name as subject_name, tp.name as topic_name
        FROM tasks t
        JOIN subjects s ON t.subject_id = s.id
        LEFT JOIN topics tp ON t.topic_id = tp.id
        WHERE t.user_id = ? AND t.scheduled_date BETWEEN ? AND ?
        ORDER BY t.scheduled_date, t.priority_score DESC
    ''', (user_id, today.strftime('%Y-%m-%d'), week_end.strftime('%Y-%m-%d'))).fetchall())

    db.close()
    return tasks
