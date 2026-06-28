"""
Quiz Generator Backend Module
Generates quizzes, flashcards, and practice questions from various sources.
Follows the same LLM call pattern as note_scanner.py.
"""
import json
import os
import time
from typing import Any, Dict, List, Optional

LLM_API_URL = os.getenv('LLM_API_URL', 'https://api.openai.com/v1/chat/completions')
LLM_API_KEY = os.getenv('LLM_API_KEY', os.getenv('OPENAI_API_KEY', '')).strip()
LLM_MODEL   = os.getenv('LLM_MODEL', 'gpt-4o-mini').strip()
LLM_FALLBACK_MODEL = os.getenv('LLM_FALLBACK_MODEL', 'gemini-2.5-flash-lite').strip()
LLM_TIMEOUT = int(os.getenv('LLM_TIMEOUT', '120'))
LLM_RETRY_ATTEMPTS = 3

import requests


# ─── Helpers (shared with note_scanner pattern) ──────────────────────────────

def _extract_json(text: str) -> Dict[str, Any]:
    content = (text or '').strip()
    for prefix in ('```json', '```'):
        if content.startswith(prefix):
            content = content[len(prefix):].strip()
    if content.endswith('```'):
        content = content[:-3].strip()
    start = content.find('{')
    end   = content.rfind('}')
    if start == -1 or end == -1 or end < start:
        raise ValueError('LLM response did not contain a JSON object')
    return json.loads(content[start:end + 1])


def _extract_message_content(data: Dict[str, Any]) -> str:
    choices = data.get('choices') or []
    if not choices:
        return ''
    message = (choices[0] or {}).get('message') or {}
    content = message.get('content', '')
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return '\n'.join(
            (item.get('text') or '').strip()
            for item in content
            if isinstance(item, dict) and item.get('type') == 'text'
        ).strip()
    return ''


def _call_llm(prompt: str) -> Dict[str, Any]:
    if not LLM_API_KEY:
        return {'error': 'LLM_API_KEY is not configured on the backend.'}

    candidates = [LLM_MODEL]
    if LLM_FALLBACK_MODEL and LLM_FALLBACK_MODEL not in candidates:
        candidates.append(LLM_FALLBACK_MODEL)
    elif LLM_MODEL == 'gemini-2.5-flash':
        candidates.append('gemini-2.5-flash-lite')

    last_error = None
    for model_name in candidates:
        for attempt in range(1, LLM_RETRY_ATTEMPTS + 1):
            try:
                response = requests.post(
                    LLM_API_URL,
                    json={
                        'model': model_name,
                        'messages': [{'role': 'user', 'content': prompt}],
                        'temperature': 0.3,
                        'response_format': {'type': 'json_object'},
                    },
                    headers={
                        'Authorization': f'Bearer {LLM_API_KEY}',
                        'Content-Type': 'application/json',
                    },
                    timeout=LLM_TIMEOUT,
                )
                response.raise_for_status()
                return _extract_json(_extract_message_content(response.json()))
            except requests.RequestException as exc:
                status_code = getattr(getattr(exc, 'response', None), 'status_code', None)
                response_body = ''
                if getattr(exc, 'response', None) is not None:
                    try:
                        response_body = (exc.response.text or '').strip()
                    except Exception:
                        response_body = ''
                last_error = (model_name, exc, response_body)
                if status_code in (429, 500, 503, 504) and attempt < LLM_RETRY_ATTEMPTS:
                    time.sleep(min(2 ** (attempt - 1), 4))
                    continue
                break
            except (ValueError, json.JSONDecodeError) as exc:
                return {'error': f'Failed to parse quiz generation response. Original error: {exc}'}

    if last_error is None:
        return {'error': 'Quiz generator request failed before reaching the LLM API.'}
    model_name, exc, response_body = last_error
    extra = f' Response body: {response_body}' if response_body else ''
    return {'error': f'Failed to fetch quiz from LLM API after retries. Original error: {exc}.{extra}'}


# ─── Prompt Builders ─────────────────────────────────────────────────────────

def _build_quiz_prompt(
    content: str,
    quiz_type: str,
    difficulty: str,
    num_questions: int,
    prioritize_weak: bool,
    exam_focused: bool,
    include_explanations: bool,
    weak_topics: Optional[List[str]] = None,
) -> str:
    type_instructions = {
        'mcq': 'Multiple-choice questions (MCQ) with exactly 4 options labelled A, B, C, D. Set "options" to a list of 4 strings and "correct_answer" to the correct option letter (e.g. "A").',
        'true_false': 'True/False questions. Set "options" to ["True", "False"] and "correct_answer" to "True" or "False".',
        'short_answer': 'Short-answer questions. Set "options" to [] and "correct_answer" to a 1–3 sentence ideal answer.',
        'flashcard': 'Flashcard-style question-answer pairs. Set "options" to [] and "correct_answer" to the concise answer.',
        'mixed': 'A mix of MCQ (60%), True/False (20%), and Short-Answer (20%) questions. Follow type-specific rules above for each. Include a "type" field per question ("mcq", "true_false", "short_answer").',
    }
    type_instruction = type_instructions.get(quiz_type, type_instructions['mcq'])

    difficulty_guide = {
        'easy': 'basic recall and definitions, suitable for beginners',
        'medium': 'comprehension and application of concepts',
        'hard': 'analysis, synthesis, and edge cases — challenge the student',
        'adaptive': 'a mix of easy (30%), medium (40%), and hard (30%) questions; include a "difficulty" field per question ("easy", "medium", "hard")',
    }.get(difficulty, 'medium difficulty')

    weak_note = ''
    if prioritize_weak and weak_topics:
        weak_note = f'\nFocus extra questions on these weak topics the student struggles with: {", ".join(weak_topics)}.'
    exam_note = '\nPrioritize high-yield, exam-likely questions. Use realistic exam phrasing.' if exam_focused else ''
    expl_note = '\nFor each question, include an "explanation" field (2–3 sentences explaining why the answer is correct).' if include_explanations else '\nOmit the "explanation" field or set it to "".'

    return f"""You are an expert AI tutor and exam coach generating a high-quality quiz.

Generate exactly {num_questions} questions from the study material below.

Quiz type: {type_instruction}
Difficulty: {difficulty_guide}{weak_note}{exam_note}{expl_note}

Return ONLY a valid JSON object with this exact schema:
{{
  "title": "string — a descriptive quiz title",
  "source_summary": "string — 1–2 sentences about the material covered",
  "questions": [
    {{
      "id": 1,
      "question": "string",
      "options": ["string"] or [],
      "correct_answer": "string",
      "explanation": "string or empty",
      "topic": "string — the topic/chapter this tests",
      "difficulty": "easy|medium|hard",
      "type": "mcq|true_false|short_answer|flashcard"
    }}
  ]
}}

Rules:
- Questions must be specific to the material, not generic.
- Each question must test a distinct concept.
- Topics must come from the actual content.
- Answers must be unambiguous and factually correct.
- Keep question text concise and clear.

STUDY MATERIAL:
{content[:8000]}
"""


# ─── Mock / Fallback ─────────────────────────────────────────────────────────

def _mock_quiz(title: str, num_questions: int, quiz_type: str) -> Dict[str, Any]:
    """Returns a demo quiz when the LLM API key is missing."""
    questions = []
    for i in range(min(num_questions, 5)):
        if quiz_type in ('mcq', 'mixed'):
            q = {
                'id': i + 1,
                'question': f'Sample MCQ question #{i + 1} — What does concept {i + 1} describe?',
                'options': [
                    f'A) First possible answer for concept {i + 1}',
                    f'B) Second possible answer for concept {i + 1}',
                    f'C) Correct answer for concept {i + 1}',
                    f'D) Fourth possible answer for concept {i + 1}',
                ],
                'correct_answer': 'C',
                'explanation': f'Concept {i + 1} is best described by option C because it captures the core definition.',
                'topic': f'Topic {i + 1}',
                'difficulty': 'medium',
                'type': 'mcq',
            }
        elif quiz_type == 'true_false':
            q = {
                'id': i + 1,
                'question': f'Sample True/False #{i + 1}: This statement about concept {i + 1} is correct.',
                'options': ['True', 'False'],
                'correct_answer': 'True',
                'explanation': f'This statement is true because concept {i + 1} directly supports it.',
                'topic': f'Topic {i + 1}',
                'difficulty': 'easy',
                'type': 'true_false',
            }
        else:
            q = {
                'id': i + 1,
                'question': f'Explain concept {i + 1} in your own words.',
                'options': [],
                'correct_answer': f'Concept {i + 1} refers to the key idea demonstrated in this study material.',
                'explanation': '',
                'topic': f'Topic {i + 1}',
                'difficulty': 'medium',
                'type': 'short_answer',
            }
        questions.append(q)

    return {
        'title': title or 'Sample Quiz (Demo Mode)',
        'source_summary': 'This is a demo quiz generated because no LLM API key is configured. Set LLM_API_KEY in your .env.local file for real AI-generated questions.',
        'questions': questions,
    }


# ─── Normaliser ──────────────────────────────────────────────────────────────

def _normalize_quiz(raw: Dict[str, Any], quiz_type: str, num_questions: int) -> Dict[str, Any]:
    questions = raw.get('questions') or []
    normalized = []
    for i, q in enumerate(questions[:num_questions]):
        if not isinstance(q, dict):
            continue
        q_type = q.get('type', quiz_type if quiz_type != 'mixed' else 'mcq')
        options = q.get('options') or []
        if isinstance(options, str):
            options = [options]
        options = [str(o) for o in options][:4]
        normalized.append({
            'id': i + 1,
            'question': str(q.get('question', '')).strip(),
            'options': options,
            'correct_answer': str(q.get('correct_answer', '')).strip(),
            'explanation': str(q.get('explanation', '')).strip(),
            'topic': str(q.get('topic', 'General')).strip(),
            'difficulty': str(q.get('difficulty', 'medium')).lower(),
            'type': q_type,
        })
    return {
        'title': str(raw.get('title', 'AI-Generated Quiz')).strip(),
        'source_summary': str(raw.get('source_summary', '')).strip(),
        'questions': normalized,
    }


# ─── Public API ──────────────────────────────────────────────────────────────

def generate_quiz_from_text(
    content: str,
    quiz_type: str = 'mcq',
    difficulty: str = 'medium',
    num_questions: int = 10,
    prioritize_weak: bool = False,
    exam_focused: bool = False,
    include_explanations: bool = True,
    weak_topics: Optional[List[str]] = None,
    title_hint: str = '',
) -> Dict[str, Any]:
    """
    Generate a quiz from arbitrary text content.
    Returns the same structure regardless of whether LLM is available.
    """
    if not LLM_API_KEY:
        return _mock_quiz(title_hint or 'AI Quiz', num_questions, quiz_type)

    prompt = _build_quiz_prompt(
        content=content,
        quiz_type=quiz_type,
        difficulty=difficulty,
        num_questions=num_questions,
        prioritize_weak=prioritize_weak,
        exam_focused=exam_focused,
        include_explanations=include_explanations,
        weak_topics=weak_topics or [],
    )
    raw = _call_llm(prompt)
    if 'error' in raw:
        return raw
    return _normalize_quiz(raw, quiz_type, num_questions)
