import os
import json
from typing import List, Dict, Any
from pathlib import Path

import requests

from models import get_db, row_to_dict, rows_to_list
from scheduler import get_todays_schedule, get_weekly_schedule
from analytics import get_analytics, get_history
from adaptive import get_insights, detect_burnout


def _load_local_env() -> None:
    env_paths = [
        Path(__file__).resolve().parent.parent / '.env.local',
        Path(__file__).resolve().parent / '.env.local',
    ]
    for env_path in env_paths:
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding='utf-8').splitlines():
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip())
        break


_load_local_env()

LLM_API_URL = os.getenv('LLM_API_URL', 'https://api.openai.com/v1/chat/completions')
LLM_API_KEY = os.getenv('LLM_API_KEY', os.getenv('OPENAI_API_KEY', '')).strip()
LLM_MODEL = os.getenv('LLM_MODEL', 'gpt-4o-mini').strip()
LLM_TIMEOUT = int(os.getenv('LLM_TIMEOUT', '90'))


def _trim_history(history: List[Dict[str, Any]] | None, limit: int = 8) -> List[Dict[str, str]]:
    cleaned = []
    for item in (history or [])[-limit:]:
        role = item.get('role')
        content = (item.get('content') or '').strip()
        if role in ('user', 'assistant') and content:
            cleaned.append({'role': role, 'content': content[:2000]})
    return cleaned


def _build_user_context(user_id: int) -> Dict[str, Any]:
    db = get_db()
    c = db.cursor()

    user = row_to_dict(c.execute(
        'SELECT id, name, daily_hours, peak_time FROM users WHERE id = ?',
        (user_id,)
    ).fetchone())

    subjects = rows_to_list(c.execute('''
        SELECT id, name, proficiency, difficulty, exam_date, priority_score,
               total_hours_spent, completion_rate, target_proficiency, target_date
        FROM subjects
        WHERE user_id = ?
        ORDER BY priority_score DESC, name ASC
    ''', (user_id,)).fetchall())
    db.close()

    analytics = get_analytics(user_id)
    burnout = detect_burnout(user_id)
    insights = get_insights(user_id)
    today_tasks = get_todays_schedule(user_id)
    week_tasks = get_weekly_schedule(user_id)
    recent_history = get_history(user_id, 10)

    return {
        'user': user,
        'subjects': subjects[:8],
        'today_tasks': today_tasks[:12],
        'week_tasks': week_tasks[:20],
        'analytics': analytics,
        'insights': insights,
        'burnout': burnout,
        'recent_history': recent_history,
    }


def _build_messages(context: Dict[str, Any], message: str, history: List[Dict[str, Any]] | None) -> List[Dict[str, str]]:
    system_prompt = (
        "You are StudyAI Coach, a focused study-planning assistant inside a student productivity app. "
        "Answer only using the provided study context. Do not invent exams, subjects, performance data, or schedule entries. "
        "If the user asks something outside the available study data, say that directly and offer a next step. "
        "Keep answers practical, clear, and concise. Use short paragraphs or short bullet lists only when helpful."
    )

    context_message = (
        "Study context JSON:\n"
        f"{json.dumps(context, ensure_ascii=True)}\n\n"
        "Use this context to answer questions about schedule, weak subjects, missed work, exams, progress, and study strategy."
    )

    messages = [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': context_message},
    ]
    messages.extend(_trim_history(history))
    messages.append({'role': 'user', 'content': message.strip()})
    return messages


def _extract_assistant_content(data: Dict[str, Any]) -> str:
    choices = data.get('choices') or []
    if not choices:
        return ''

    message = (choices[0] or {}).get('message') or {}
    content = message.get('content', '')
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        text_parts = []
        for item in content:
            if isinstance(item, dict) and item.get('type') == 'text':
                text = (item.get('text') or '').strip()
                if text:
                    text_parts.append(text)
        return '\n'.join(text_parts).strip()

    return ''


def chat_with_study_coach(user_id: int, message: str, history: List[Dict[str, Any]] | None = None) -> Dict[str, Any]:
    if not message or not message.strip():
        return {'error': 'Message is required'}

    context = _build_user_context(user_id)
    if not context.get('user'):
        return {'error': 'User not found'}
    if not LLM_API_KEY:
        return {
            'error_type': 'configuration_error',
            'error': 'LLM_API_KEY is not configured on the backend.',
        }

    try:
        response = requests.post(
            LLM_API_URL,
            json={
                'model': LLM_MODEL,
                'messages': _build_messages(context, message, history),
                'temperature': 0.4,
            },
            headers={
                'Authorization': f'Bearer {LLM_API_KEY}',
                'Content-Type': 'application/json',
            },
            timeout=LLM_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        response_body = ''
        if getattr(exc, 'response', None) is not None:
            try:
                response_body = (exc.response.text or '').strip()
            except Exception:
                response_body = ''

        extra = f' Response body: {response_body}' if response_body else ''
        return {
            'error_type': 'service_unavailable',
            'error': (
                'Unable to reach the LLM API. Check LLM_API_URL, LLM_MODEL, and LLM_API_KEY. '
                f'Original error: {exc}{extra}'
            )
        }

    content = _extract_assistant_content(data)
    if not content:
        return {'error_type': 'service_unavailable', 'error': 'The LLM API returned an empty response'}

    return {
        'answer': content,
        'model': LLM_MODEL,
        'context_snapshot': {
            'subject_count': len(context.get('subjects') or []),
            'today_task_count': len(context.get('today_tasks') or []),
            'burnout_detected': bool((context.get('burnout') or {}).get('detected')),
        },
    }
