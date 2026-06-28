"""
Flask Backend - Adaptive AI Study Coach API
"""
import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
load_dotenv(dotenv_path=env_path)

from flask import Flask, request, jsonify
from flask_cors import CORS
from models import init_db, get_db, rows_to_list, row_to_dict
from scheduler import generate_schedule, get_todays_schedule, get_weekly_schedule, compute_goal_info
from adaptive import (
    process_task_feedback, run_adaptive_update, get_insights,
    detect_burnout, get_topics_with_confidence
)
from analytics import get_analytics, get_history
from llm_coach import chat_with_study_coach
from note_scanner import scan_note_image, scan_pdf_document
from quiz_generator import generate_quiz_from_text
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import bcrypt
import sqlite3

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"])
app.config['JWT_SECRET_KEY'] = 'adaptive-study-coach-super-secret'
jwt = JWTManager(app)

# Initialize database on startup
init_db()


def current_user_id():
    return int(get_jwt_identity())

# ─────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────
@app.route("/")
def home():
    return {
        "status": "Backend is running successfully!",
        "message": "Welcome to Adaptly AI Assistant API 🚀"
    }


@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400
    
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    db = get_db()
    c = db.cursor()
    try:
        c.execute('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', ('', email, password_hash))
        user_id = c.lastrowid
        db.commit()
    except sqlite3.IntegrityError:
        db.close()
        return jsonify({'error': 'Email already registered'}), 400
        
    db.close()
    token = create_access_token(identity=str(user_id))
    return jsonify({'access_token': token, 'user': {'id': user_id, 'email': email, 'onboarding_complete': 0}})

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    db = get_db()
    c = db.cursor()
    user = row_to_dict(c.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone())
    db.close()
    
    if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    token = create_access_token(identity=str(user['id']))
    user.pop('password_hash', None)
    return jsonify({'access_token': token, 'user': user})

@app.route('/api/user/reset', methods=['DELETE'])
@jwt_required()
def reset_user():
    user_id = current_user_id()
    db = get_db()
    c = db.cursor()
    
    c.execute('DELETE FROM session_logs WHERE user_id = ?', (user_id,))
    c.execute('DELETE FROM tasks WHERE user_id = ?', (user_id,))
    
    subjects = c.execute('SELECT id FROM subjects WHERE user_id = ?', (user_id,)).fetchall()
    for s in subjects:
        c.execute('DELETE FROM topics WHERE subject_id = ?', (s['id'],))
        
    c.execute('DELETE FROM subjects WHERE user_id = ?', (user_id,))
    c.execute('UPDATE users SET onboarding_complete = 0 WHERE id = ?', (user_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})


# ─────────────────────────────────────────────
# USER ROUTES
# ─────────────────────────────────────────────

@app.route('/api/user/me', methods=['GET'])
@jwt_required()
def get_me():
    user_id = current_user_id()
    db = get_db()
    c = db.cursor()
    user = row_to_dict(c.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone())
    db.close()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    user.pop('password_hash', None)
    return jsonify(user)


@app.route('/api/user/me', methods=['PUT'])
@jwt_required()
def update_me():
    user_id = current_user_id()
    data = request.get_json()
    db = get_db()
    c = db.cursor()
    c.execute(
        'UPDATE users SET name = ?, daily_hours = ?, peak_time = ?, onboarding_complete = 1 WHERE id = ?',
        (data.get('name'), data.get('daily_hours', 4.0), data.get('peak_time', 'morning'), user_id)
    )
    db.commit()
    
    user = row_to_dict(c.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone())
    db.close()
    user.pop('password_hash', None)
    return jsonify(user)


# ─────────────────────────────────────────────
# SUBJECTS ROUTES
# ─────────────────────────────────────────────

@app.route('/api/subjects', methods=['GET'])
@app.route('/api/subjects/<int:user_id>', methods=['GET'])
@jwt_required()
def get_subjects(user_id=None):
    user_id = current_user_id()
    db = get_db()
    c = db.cursor()
    subjects = rows_to_list(c.execute(
        'SELECT * FROM subjects WHERE user_id = ? ORDER BY priority_score DESC', (user_id,)
    ).fetchall())
    db.close()
    return jsonify(subjects)


@app.route('/api/subjects', methods=['POST'])
@jwt_required()
def add_subject():
    user_id = current_user_id()
    data = request.get_json()
    db = get_db()
    c = db.cursor()
    c.execute('''
        INSERT INTO subjects (user_id, name, proficiency, difficulty, exam_date, effective_difficulty)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (
        user_id, data['name'],
        data.get('proficiency', 3), data.get('difficulty', 3),
        data.get('exam_date'),
        data.get('difficulty', 3),
    ))
    subject_id = c.lastrowid

    # Add topics if provided
    for topic in data.get('topics', []):
        c.execute(
            'INSERT INTO topics (subject_id, user_id, name, proficiency) VALUES (?, ?, ?, ?)',
            (subject_id, user_id, topic['name'], topic.get('proficiency', data.get('proficiency', 3)))
        )

    db.commit()
    db.close()
    return jsonify({'subject_id': subject_id})


@app.route('/api/subjects/<int:subject_id>', methods=['PUT', 'DELETE'])
@jwt_required()
def modify_subject(subject_id):
    user_id = current_user_id()
    db = get_db()
    c = db.cursor()
    
    subj = c.execute('SELECT id FROM subjects WHERE id = ? AND user_id = ?', (subject_id, user_id)).fetchone()
    if not subj: return jsonify({'error': 'Not found or not yours'}), 403
    
    if request.method == 'PUT':
        data = request.get_json()
        c.execute('''
            UPDATE subjects SET name = ?, proficiency = ?, difficulty = ?, exam_date = ?
            WHERE id = ?
        ''', (data.get('name'), data.get('proficiency'), data.get('difficulty'),
              data.get('exam_date'), subject_id))
        db.commit()
        db.close()
        return jsonify({'success': True})
    elif request.method == 'DELETE':
        c.execute('DELETE FROM topics WHERE subject_id = ?', (subject_id,))
        c.execute('DELETE FROM tasks WHERE subject_id = ?', (subject_id,))
        c.execute('DELETE FROM subjects WHERE id = ?', (subject_id,))
        db.commit()
        db.close()
        return jsonify({'success': True})


# ─────────────────────────────────────────────
# SCHEDULE ROUTES
# ─────────────────────────────────────────────

@app.route('/api/schedule/generate/<int:user_id>', methods=['POST'])
@jwt_required()
def generate_user_schedule(user_id):
    if user_id != current_user_id(): return jsonify({'error': 'Unauthorized'}), 403
    try:
        days = request.get_json().get('days', 7) if request.get_json() else 7
        run_adaptive_update(user_id)
        tasks = generate_schedule(user_id, days)
        return jsonify({'tasks_created': len(tasks), 'success': True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/api/schedule/today/<int:user_id>', methods=['GET'])
@jwt_required()
def today_schedule(user_id):
    if user_id != current_user_id(): return jsonify({'error': 'Unauthorized'}), 403
    from adaptive import detect_burnout
    tasks = get_todays_schedule(user_id)

    # Burnout check: reduce today's sessions by 40% if detected
    burnout_info = detect_burnout(user_id)
    burnout_detected = burnout_info.get('detected', False)

    if burnout_detected:
        # Keep only highest-priority 60% of tasks
        tasks_sorted = sorted(tasks, key=lambda t: t.get('priority_score', 0), reverse=True)
        keep_count = max(1, round(len(tasks_sorted) * 0.6))
        tasks = tasks_sorted[:keep_count]

    return jsonify({
        'tasks': tasks,
        'burnout_detected': burnout_detected,
        'burnout_reason': burnout_info.get('reason', ''),
    })


@app.route('/api/schedule/week/<int:user_id>', methods=['GET'])
@jwt_required()
def week_schedule(user_id):
    if user_id != current_user_id(): return jsonify({'error': 'Unauthorized'}), 403
    tasks = get_weekly_schedule(user_id)
    return jsonify(tasks)


# ─────────────────────────────────────────────
# TASK / FEEDBACK ROUTES
# ─────────────────────────────────────────────

@app.route('/api/tasks/feedback', methods=['POST'])
@jwt_required()
def submit_feedback():
    user_id = current_user_id()
    data = request.get_json()
    # Validate task belongs to the authenticated user
    db = get_db()
    task_row = db.cursor().execute('SELECT user_id FROM tasks WHERE id = ?', (data.get('task_id'),)).fetchone()
    db.close()
    if not task_row or row_to_dict(task_row)['user_id'] != user_id:
        return jsonify({'error': 'Unauthorized or task not found'}), 403
    result = process_task_feedback(
        task_id=data['task_id'],
        status=data['status'],
        difficulty_feedback=data.get('difficulty_feedback', 3),
        hours_studied=data.get('hours_studied'),
        notes=data.get('notes', ''),
        confidence_rating=data.get('confidence_rating', 3),
    )
    return jsonify(result)


@app.route('/api/tasks/<int:user_id>', methods=['GET'])
@jwt_required()
def get_all_tasks(user_id):
    if user_id != current_user_id(): return jsonify({'error': 'Unauthorized'}), 403
    db = get_db()
    c = db.cursor()
    tasks = rows_to_list(c.execute('''
        SELECT t.*, s.name as subject_name, tp.name as topic_name
        FROM tasks t
        JOIN subjects s ON t.subject_id = s.id
        LEFT JOIN topics tp ON t.topic_id = tp.id
        WHERE t.user_id = ?
        ORDER BY t.scheduled_date DESC, t.priority_score DESC
    ''', (user_id,)).fetchall())
    db.close()
    return jsonify(tasks)


# ─────────────────────────────────────────────
# INSIGHTS & ANALYTICS ROUTES
# ─────────────────────────────────────────────

@app.route('/api/insights/<int:user_id>', methods=['GET'])
@jwt_required()
def user_insights(user_id):
    if user_id != current_user_id(): return jsonify({'error': 'Unauthorized'}), 403
    data = get_insights(user_id)
    return jsonify(data)


@app.route('/api/analytics/<int:user_id>', methods=['GET'])
@jwt_required()
def user_analytics(user_id):
    if user_id != current_user_id(): return jsonify({'error': 'Unauthorized'}), 403
    data = get_analytics(user_id)
    return jsonify(data)


@app.route('/api/history/<int:user_id>', methods=['GET'])
@jwt_required()
def user_history(user_id):
    if user_id != current_user_id(): return jsonify({'error': 'Unauthorized'}), 403
    limit = request.args.get('limit', 50, type=int)
    data = get_history(user_id, limit)
    return jsonify(data)


@app.route('/api/adaptive/update/<int:user_id>', methods=['POST'])
def adaptive_update(user_id):
    result = run_adaptive_update(user_id)
    return jsonify(result)


# ─────────────────────────────────────────────
# TOPICS / CONFIDENCE DECAY
# ─────────────────────────────────────────────

@app.route('/api/topics/<int:user_id>', methods=['GET'])
@jwt_required()
def get_topics(user_id):
    """Return topics with current decayed confidence."""
    if user_id != current_user_id(): return jsonify({'error': 'Unauthorized'}), 403
    topics = get_topics_with_confidence(user_id)
    return jsonify(topics)


# ─────────────────────────────────────────────
# GOAL-BASED PLANNING
# ─────────────────────────────────────────────

@app.route('/api/goals/<int:user_id>', methods=['POST'])
@jwt_required()
def set_goal(user_id):
    """
    Set a goal for a subject.
    Body: { subject_id, target_proficiency, target_date }
    """
    if user_id != current_user_id(): return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json()
    db = get_db()
    c = db.cursor()
    c.execute('''
        UPDATE subjects
        SET target_proficiency = ?, target_date = ?
        WHERE id = ? AND user_id = ?
    ''', (
        data.get('target_proficiency', 0.85),
        data.get('target_date'),
        data['subject_id'],
        user_id,
    ))
    db.commit()
    # Return updated goal info
    subject = row_to_dict(c.execute('SELECT * FROM subjects WHERE id = ?', (data['subject_id'],)).fetchone())
    user_row = row_to_dict(c.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone())
    db.close()
    if not subject:
        return jsonify({'error': 'Subject not found'}), 404

    daily_hours = user_row.get('daily_hours', 4.0) if user_row else 4.0
    goal_info = compute_goal_info(subject, daily_hours)
    return jsonify({'success': True, **goal_info})


# ─────────────────────────────────────────────
# BURNOUT
# ─────────────────────────────────────────────

@app.route('/api/burnout/<int:user_id>', methods=['GET'])
@jwt_required()
def burnout_status(user_id):
    """Return current burnout status for a user."""
    if user_id != current_user_id(): return jsonify({'error': 'Unauthorized'}), 403
    burnout_info = detect_burnout(user_id)
    return jsonify(burnout_info)


# CHAT COACH

@app.route('/api/chat/<int:user_id>', methods=['POST'])
@jwt_required()
def chat_coach(user_id):
    """Chat with the API-backed study coach using grounded app context."""
    if user_id != current_user_id(): return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json() or {}
    result = chat_with_study_coach(
        user_id=user_id,
        message=data.get('message', ''),
        history=data.get('history', []),
    )
    if result.get('error'):
        if result['error'] == 'User not found':
            status = 404
        elif result.get('error_type') == 'service_unavailable':
            status = 503
        else:
            status = 400
        return jsonify(result), status
    return jsonify(result)


# ─────────────────────────────────────────────
# NOTE SCANNER
# ─────────────────────────────────────────────

@app.route('/api/note-scan', methods=['POST'])
@jwt_required()
def note_scan():
    # user_id = get_jwt_identity()
    if 'image' not in request.files:
        return jsonify({'error': 'No file part provided'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    file_bytes = file.read()
    media_type = file.mimetype
    
    if media_type == 'application/pdf':
        result = scan_pdf_document(file_bytes)
    else:
        if not media_type or not media_type.startswith('image/'):
            media_type = 'image/jpeg' # fallback
            
        result = scan_note_image(file_bytes, media_type)
    
    if "error" in result:
        return jsonify(result), 500
        
    return jsonify(result)

@app.route('/api/subjects/from-scan', methods=['POST'])
@jwt_required()
def save_subject_from_scan():
    data = request.get_json()
    user_id = current_user_id()
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    db = get_db()
    c = db.cursor()
    c.execute('''
        INSERT INTO subjects (user_id, name, proficiency, difficulty, effective_difficulty)
        VALUES (?, ?, ?, ?, ?)
    ''', (
        user_id, 
        data.get('subject', 'New Scanned Subject'), 
        3, # Default proficiency
        data.get('difficulty', 3),
        data.get('difficulty', 3),
    ))
    subject_id = c.lastrowid

    # Add topics if provided
    for topic_name in data.get('topics', []):
        c.execute(
            'INSERT INTO topics (subject_id, user_id, name, proficiency) VALUES (?, ?, ?, ?)',
            (subject_id, user_id, topic_name, 3)
        )

    # Note: We don't have a flashcards table in current schema yet, 
    # but the frontend can still use them visually! If we want to save them we'd need a new table or just store in a note field.
    # Currently ignoring flashcards for DB persistence as per existing schema.

    db.commit()
    db.close()
    return jsonify({'subject_id': subject_id, 'success': True})

# ─────────────────────────────────────────────
# QUIZ GENERATOR ROUTES
# ─────────────────────────────────────────────

@app.route('/api/quiz/generate', methods=['POST'])
@jwt_required()
def generate_quiz():
    """
    Generate a quiz from various sources.
    Body:
      source_type: 'text' | 'subject' | 'pdf'
      content: raw text (required for source_type='text')
      subject_id: int (required for source_type='subject')
      quiz_type: 'mcq' | 'true_false' | 'short_answer' | 'flashcard' | 'mixed'
      difficulty: 'easy' | 'medium' | 'hard' | 'adaptive'
      num_questions: int (default 10)
      prioritize_weak: bool
      exam_focused: bool
      include_explanations: bool
    """
    user_id = current_user_id()
    data = request.get_json() or {}

    source_type     = data.get('source_type', 'text')
    quiz_type       = data.get('quiz_type', 'mcq')
    difficulty      = data.get('difficulty', 'medium')
    num_questions   = max(3, min(30, int(data.get('num_questions', 10))))
    prioritize_weak = bool(data.get('prioritize_weak', False))
    exam_focused    = bool(data.get('exam_focused', False))
    include_expl    = bool(data.get('include_explanations', True))

    weak_topics = []
    content     = ''
    title_hint  = ''

    if source_type == 'subject':
        subject_id = data.get('subject_id')
        if not subject_id:
            return jsonify({'error': 'subject_id is required for source_type=subject'}), 400
        db = get_db()
        c  = db.cursor()
        subject = row_to_dict(c.execute(
            'SELECT * FROM subjects WHERE id = ? AND user_id = ?', (subject_id, user_id)
        ).fetchone())
        if not subject:
            db.close()
            return jsonify({'error': 'Subject not found or not yours'}), 404

        topics = rows_to_list(c.execute(
            'SELECT name, confidence FROM topics WHERE subject_id = ? ORDER BY confidence ASC',
            (subject_id,)
        ).fetchall())
        db.close()

        topic_names = [t['name'] for t in topics]
        weak_topics = [t['name'] for t in topics if (t.get('confidence') or 0.7) < 0.5]

        content = (
            f"Subject: {subject['name']}\n"
            f"Difficulty level: {subject.get('difficulty', 3)}/5\n"
            f"Topics covered:\n" +
            '\n'.join(f"- {t}" for t in topic_names)
        )
        title_hint = f"{subject['name']} Quiz"

    elif source_type == 'text':
        content = str(data.get('content', '')).strip()
        if not content:
            return jsonify({'error': 'content is required for source_type=text'}), 400
        title_hint = data.get('title_hint', 'Custom Quiz')

    else:
        return jsonify({'error': f'Unsupported source_type: {source_type}'}), 400

    result = generate_quiz_from_text(
        content=content,
        quiz_type=quiz_type,
        difficulty=difficulty,
        num_questions=num_questions,
        prioritize_weak=prioritize_weak,
        exam_focused=exam_focused,
        include_explanations=include_expl,
        weak_topics=weak_topics,
        title_hint=title_hint,
    )

    if 'error' in result:
        return jsonify(result), 500

    return jsonify(result)


@app.route('/api/quiz/generate-from-upload', methods=['POST'])
@jwt_required()
def generate_quiz_from_upload():
    """
    Generate a quiz from an uploaded PDF or image (text extracted then fed to LLM).
    Form fields: file, quiz_type, difficulty, num_questions, include_explanations, exam_focused
    """
    user_id = current_user_id()  # noqa: F841

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    quiz_type     = request.form.get('quiz_type', 'mcq')
    difficulty    = request.form.get('difficulty', 'medium')
    num_questions = max(3, min(30, int(request.form.get('num_questions', 10))))
    include_expl  = request.form.get('include_explanations', 'true').lower() == 'true'
    exam_focused  = request.form.get('exam_focused', 'false').lower() == 'true'

    file_bytes = file.read()
    media_type = file.mimetype or ''

    # Extract text from PDF
    if media_type == 'application/pdf':
        import io, PyPDF2
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        except Exception as exc:
            return jsonify({'error': f'Failed to read PDF: {exc}'}), 400

        text_parts = []
        for i in range(min(15, len(reader.pages))):
            try:
                t = reader.pages[i].extract_text() or ''
                if t.strip():
                    text_parts.append(t.strip())
            except Exception:
                pass
        content = '\n\n'.join(text_parts).strip()
        if not content:
            content = 'PDF document uploaded for quiz generation (image-based PDF, text not extractable).'
        title_hint = f'{file.filename} Quiz'
    else:
        # For images, send a descriptive prompt – image content can't be extracted as text
        content = (
            'An image of study notes was uploaded. '
            'Generate quiz questions about typical academic study material topics covered in handwritten notes.'
        )
        title_hint = 'Notes Quiz'

    result = generate_quiz_from_text(
        content=content,
        quiz_type=quiz_type,
        difficulty=difficulty,
        num_questions=num_questions,
        include_explanations=include_expl,
        exam_focused=exam_focused,
        title_hint=title_hint,
    )

    if 'error' in result:
        return jsonify(result), 500

    return jsonify(result)


@app.route('/api/quiz/save', methods=['POST'])
@jwt_required()
def save_quiz():
    """
    Save a completed quiz attempt.
    Body: { title, source_type, quiz_type, questions_json, score, weak_topics, source_reference }
    """
    user_id = current_user_id()
    data    = request.get_json() or {}

    db = get_db()
    c  = db.cursor()

    # Ensure saved_quizzes table exists
    c.execute('''CREATE TABLE IF NOT EXISTS saved_quizzes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT,
        source_type TEXT DEFAULT 'text',
        source_reference TEXT,
        quiz_type TEXT DEFAULT 'mcq',
        questions_json TEXT,
        score REAL,
        total_questions INTEGER,
        weak_topics TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')

    import json as _json
    questions_json = _json.dumps(data.get('questions', []))
    weak_topics    = _json.dumps(data.get('weak_topics', []))

    c.execute('''
        INSERT INTO saved_quizzes
        (user_id, title, source_type, source_reference, quiz_type, questions_json,
         score, total_questions, weak_topics)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        user_id,
        data.get('title', 'Untitled Quiz'),
        data.get('source_type', 'text'),
        data.get('source_reference', ''),
        data.get('quiz_type', 'mcq'),
        questions_json,
        data.get('score'),
        data.get('total_questions', 0),
        weak_topics,
    ))
    quiz_id = c.lastrowid
    db.commit()
    db.close()
    return jsonify({'quiz_id': quiz_id, 'success': True})


@app.route('/api/quiz/history', methods=['GET'])
@jwt_required()
def quiz_history():
    """Return saved quiz history for the current user."""
    user_id = current_user_id()
    db = get_db()
    c  = db.cursor()
    try:
        quizzes = rows_to_list(c.execute(
            'SELECT id, title, source_type, quiz_type, score, total_questions, weak_topics, created_at '
            'FROM saved_quizzes WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
            (user_id,)
        ).fetchall())
    except Exception:
        quizzes = []
    db.close()
    return jsonify(quizzes)


# ─────────────────────────────────────────────
# HEALTH CHECK
# ─────────────────────────────────────────────

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'message': 'Adaptive AI Study Coach API is running'})


if __name__ == '__main__':
    print("Starting Adaptive AI Study Coach Backend...")
    app.run(debug=True, port=5000, host='0.0.0.0')
