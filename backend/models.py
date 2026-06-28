import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'database.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    # Users table
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        daily_hours REAL DEFAULT 4.0,
        peak_time TEXT DEFAULT 'morning',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )''')

    # Subjects table
    c.execute('''CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT NOT NULL,
        proficiency INTEGER DEFAULT 3,
        difficulty INTEGER DEFAULT 3,
        exam_date TEXT,
        priority_score REAL DEFAULT 5.0,
        total_hours_spent REAL DEFAULT 0.0,
        completion_rate REAL DEFAULT 1.0,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')

    # Topics table
    c.execute('''CREATE TABLE IF NOT EXISTS topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER,
        name TEXT NOT NULL,
        proficiency INTEGER DEFAULT 3,
        completed INTEGER DEFAULT 0,
        FOREIGN KEY(subject_id) REFERENCES subjects(id)
    )''')

    # Study tasks table
    c.execute('''CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        subject_id INTEGER,
        topic_id INTEGER,
        scheduled_date TEXT NOT NULL,
        scheduled_time TEXT,
        duration_hours REAL DEFAULT 1.0,
        status TEXT DEFAULT 'pending',
        difficulty_feedback INTEGER,
        rescheduled_count INTEGER DEFAULT 0,
        priority_score REAL DEFAULT 5.0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(subject_id) REFERENCES subjects(id),
        FOREIGN KEY(topic_id) REFERENCES topics(id)
    )''')

    # Session logs table
    c.execute('''CREATE TABLE IF NOT EXISTS session_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        task_id INTEGER,
        subject_id INTEGER,
        date TEXT NOT NULL,
        hours_studied REAL DEFAULT 0.0,
        status TEXT,
        difficulty_feedback INTEGER,
        notes TEXT,
        quality_score REAL DEFAULT NULL,
        confidence_rating REAL DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(task_id) REFERENCES tasks(id)
    )''')

    # Burnout tracking table
    c.execute('''CREATE TABLE IF NOT EXISTS burnout_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        detected INTEGER DEFAULT 0,
        reason TEXT,
        triggered_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')

    conn.commit()

    # ── ALTER TABLE migration — add new columns if they don't exist ──
    migrations = [
        # FSRS fields on subjects
        ("subjects", "stability REAL DEFAULT 1.0"),
        ("subjects", "difficulty_fsrs REAL DEFAULT 0.3"),
        ("subjects", "last_review TEXT"),
        ("subjects", "next_review TEXT"),
        ("subjects", "review_count INTEGER DEFAULT 0"),
        # Goal-based planning fields on subjects
        ("subjects", "target_proficiency REAL DEFAULT 0.85"),
        ("subjects", "target_date TEXT"),
        ("subjects", "effective_difficulty REAL DEFAULT 3.0"),
        # Confidence decay fields on topics
        ("topics", "confidence REAL DEFAULT 0.7"),
        ("topics", "last_studied TEXT"),
        ("topics", "decay_rate REAL DEFAULT 0.05"),
        # Session quality on tasks
        ("tasks", "quality_score REAL DEFAULT NULL"),
        ("tasks", "confidence_rating REAL DEFAULT NULL"),
        # Session quality & confidence on session_logs (was missing — caused 500 errors)
        ("session_logs", "quality_score REAL DEFAULT NULL"),
        ("session_logs", "confidence_rating REAL DEFAULT NULL"),
        ("topics", "user_id INTEGER"),
    ]

    for table, col_def in migrations:
        col_name = col_def.split()[0]
        try:
            c.execute(f"ALTER TABLE {table} ADD COLUMN {col_def}")
            conn.commit()
        except Exception:
            pass  # column already exists

    # Auth fields need a separate migration because SQLite cannot add
    # a UNIQUE column directly with ALTER TABLE.
    user_columns = {row["name"] for row in c.execute("PRAGMA table_info(users)").fetchall()}
    if "email" not in user_columns:
        c.execute("ALTER TABLE users ADD COLUMN email TEXT")
        conn.commit()
    if "password_hash" not in user_columns:
        c.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
        conn.commit()
    if "onboarding_complete" not in user_columns:
        c.execute("ALTER TABLE users ADD COLUMN onboarding_complete INTEGER DEFAULT 0")
        conn.commit()

    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)")
    conn.commit()

    conn.close()

def row_to_dict(row):
    if row is None:
        return None
    return dict(row)

def rows_to_list(rows):
    return [dict(r) for r in rows]
