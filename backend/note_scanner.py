import io
import json
import os
import time
from typing import Any, Dict, List

import PyPDF2
import requests

LLM_API_URL = os.getenv('LLM_API_URL', 'https://api.openai.com/v1/chat/completions')
LLM_API_KEY = os.getenv('LLM_API_KEY', os.getenv('OPENAI_API_KEY', '')).strip()
LLM_MODEL = os.getenv('LLM_MODEL', 'gpt-4o-mini').strip()
LLM_FALLBACK_MODEL = os.getenv('LLM_FALLBACK_MODEL', '').strip()
LLM_TIMEOUT = int(os.getenv('LLM_TIMEOUT', '90'))

FLASHCARD_TARGET = 18
FLASHCARD_MINIMUM = 12
LLM_RETRY_ATTEMPTS = 3


def _mock_result(subject: str, summary: str, topics: List[str]) -> Dict[str, Any]:
    flashcards = [
        {
            'question': f'What is the core idea behind {topic}?',
            'answer': f'{topic} is one of the main concepts identified in the uploaded study material.',
        }
        for topic in topics[:FLASHCARD_MINIMUM]
    ]
    return {
        'subject': subject,
        'difficulty': 3,
        'summary': summary,
        'topics': topics,
        'flashcards': flashcards,
    }


def _extract_json(text: str) -> Dict[str, Any]:
    content = (text or '').strip()
    if content.startswith('```json'):
        content = content.replace('```json', '', 1).strip()
    if content.startswith('```'):
        content = content.replace('```', '', 1).strip()
    if content.endswith('```'):
        content = content[:-3].strip()

    start = content.find('{')
    end = content.rfind('}')
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
        text_parts = []
        for item in content:
            if isinstance(item, dict) and item.get('type') == 'text':
                text = (item.get('text') or '').strip()
                if text:
                    text_parts.append(text)
        return '\n'.join(text_parts).strip()

    return ''


def _normalize_topics(topics: Any) -> List[str]:
    normalized = []
    for topic in topics or []:
        text = str(topic).strip()
        if text and text not in normalized:
            normalized.append(text)
    return normalized[:10]


def _supplement_flashcards(
    flashcards: List[Dict[str, str]],
    topics: List[str],
    subject: str,
    summary: str,
) -> List[Dict[str, str]]:
    cleaned = []
    seen = set()

    for card in flashcards or []:
        question = str((card or {}).get('question', '')).strip()
        answer = str((card or {}).get('answer', '')).strip()
        if not question or not answer:
            continue
        key = question.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append({'question': question, 'answer': answer})

    topic_templates = [
        ('What is {topic}?', '{topic} is a key concept from the uploaded material within {subject}.'),
        ('Why is {topic} important?', '{topic} matters because it directly supports the main ideas covered in these notes.'),
        ('How would you explain {topic} in one short answer?', '{topic} can be explained using the summary of the uploaded content: {summary}'),
    ]

    for topic in topics:
        for question_template, answer_template in topic_templates:
            if len(cleaned) >= FLASHCARD_TARGET:
                return cleaned
            question = question_template.format(topic=topic)
            if question.lower() in seen:
                continue
            answer = answer_template.format(topic=topic, subject=subject or 'the subject', summary=summary or 'the material')
            seen.add(question.lower())
            cleaned.append({'question': question, 'answer': answer})

    while len(cleaned) < FLASHCARD_MINIMUM:
        idx = len(cleaned) + 1
        cleaned.append({
            'question': f'What is one major takeaway #{idx} from this {subject or "study"} material?',
            'answer': summary or 'Review the uploaded material and connect the identified topics to the main idea.',
        })

    return cleaned[:FLASHCARD_TARGET]


def _normalize_result(result: Dict[str, Any], fallback_subject: str, fallback_summary: str) -> Dict[str, Any]:
    subject = str(result.get('subject') or fallback_subject).strip() or fallback_subject
    summary = str(result.get('summary') or fallback_summary).strip() or fallback_summary

    try:
        difficulty = int(result.get('difficulty', 3))
    except (TypeError, ValueError):
        difficulty = 3
    difficulty = max(1, min(5, difficulty))

    topics = _normalize_topics(result.get('topics'))
    if not topics and subject:
        topics = [subject]

    flashcards = _supplement_flashcards(result.get('flashcards') or [], topics, subject, summary)
    return {
        'subject': subject,
        'difficulty': difficulty,
        'summary': summary,
        'topics': topics,
        'flashcards': flashcards,
    }


def _call_llm(prompt: str) -> Dict[str, Any]:
    if not LLM_API_KEY:
        return {'error': 'LLM_API_KEY is not configured on the backend.'}

    model_candidates = [LLM_MODEL]
    if LLM_FALLBACK_MODEL and LLM_FALLBACK_MODEL not in model_candidates:
        model_candidates.append(LLM_FALLBACK_MODEL)
    elif LLM_MODEL == 'gemini-2.5-flash':
        model_candidates.append('gemini-2.5-flash-lite')

    last_error = None

    for model_name in model_candidates:
        for attempt in range(1, LLM_RETRY_ATTEMPTS + 1):
            try:
                response = requests.post(
                    LLM_API_URL,
                    json={
                        'model': model_name,
                        'messages': [{'role': 'user', 'content': prompt}],
                        'temperature': 0.2,
                        'response_format': {'type': 'json_object'},
                    },
                    headers={
                        'Authorization': f'Bearer {LLM_API_KEY}',
                        'Content-Type': 'application/json',
                    },
                    timeout=LLM_TIMEOUT,
                )
                response.raise_for_status()
                data = response.json()
                return _extract_json(_extract_message_content(data))
            except requests.RequestException as exc:
                response_body = ''
                status_code = getattr(getattr(exc, 'response', None), 'status_code', None)
                if getattr(exc, 'response', None) is not None:
                    try:
                        response_body = (exc.response.text or '').strip()
                    except Exception:
                        response_body = ''
                last_error = (model_name, exc, response_body)

                should_retry = status_code in (429, 500, 503, 504) and attempt < LLM_RETRY_ATTEMPTS
                if should_retry:
                    time.sleep(min(2 ** (attempt - 1), 4))
                    continue
                break
            except (ValueError, json.JSONDecodeError) as exc:
                return {'error': f'Failed to parse scanner response from the LLM API. Original error: {exc}'}

    if last_error is None:
        return {'error': 'Scanner request failed before reaching the LLM API.'}

    model_name, exc, response_body = last_error
    extra = f' Response body: {response_body}' if response_body else ''
    fallback_hint = ''
    if model_name != LLM_MODEL:
        fallback_hint = f' Fallback model attempted: {model_name}.'
    return {
        'error': (
            'Failed to fetch scanner response from the LLM API after retries.'
            f' Original error: {exc}.{fallback_hint}{extra}'
        )
    }


def _build_prompt(document_text: str, source_label: str) -> str:
    trimmed_text = (document_text or '').strip()[:24000]
    return f"""
You are an elite AI study assistant analyzing uploaded {source_label}.

Read the study material and return only a raw JSON object with this exact schema:
{{
  "subject": "string",
  "difficulty": 1,
  "summary": "string",
  "topics": ["string"],
  "flashcards": [
    {{"question": "string", "answer": "string"}}
  ]
}}

Rules:
- Infer the most likely academic subject.
- Set difficulty as an integer from 1 to 5.
- Write a useful 2 to 4 sentence summary.
- Return 5 to 10 distinct topics.
- Return at least 18 high-value flashcards that cover definitions, comparisons, processes, formulas, examples, and cause-effect relationships when present.
- Flashcards must be specific to the uploaded material, not generic filler.
- Keep answers concise but informative.

STUDY MATERIAL:
{trimmed_text}
"""


def scan_note_image(image_bytes, media_type):
    """
    Analyze an uploaded note image using the configured LLM API.
    """
    if not LLM_API_KEY:
        return _mock_result(
            'Scanned Notes',
            'The scanner backend is missing an API key, so this is fallback content instead of a real scan.',
            ['Main idea', 'Key concept', 'Important detail', 'Definition', 'Example'],
        )

    prompt = _build_prompt(
        'An image was uploaded for scanning. Extract the study subject, likely topics, and produce a strong flashcard set from the visible notes.',
        'study note images',
    )
    result = _call_llm(prompt)
    if 'error' in result:
        return result
    return _normalize_result(
        result,
        fallback_subject='Scanned Notes',
        fallback_summary='Study notes were uploaded and analyzed for key concepts.',
    )


def scan_pdf_document(pdf_bytes):
    """
    Extract PDF text locally and analyze it with the configured LLM API.
    Falls back to a mock result if the PDF is image-based (no extractable text)
    or if no LLM API key is configured.
    """
    try:
        reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:
        return {'error': f'Failed to read PDF document. Original error: {exc}'}

    text_parts = []
    max_pages = min(12, len(reader.pages))
    for i in range(max_pages):
        try:
            page_text = reader.pages[i].extract_text() or ''
        except Exception:
            page_text = ''
        page_text = page_text.strip()
        if page_text:
            text_parts.append(page_text)

    text = '\n\n'.join(text_parts).strip()
    if not text:
        # Image-based / scanned PDF — no machine-readable text.
        # Return a mock result instead of a hard error so the UI still works.
        return _mock_result(
            'Scanned PDF',
            'This PDF appears to be image-based (scanned). Text could not be extracted automatically. '
            'Try uploading a photo of your notes instead for AI analysis.',
            ['Chapter Overview', 'Key Definitions', 'Main Concepts', 'Important Formulas', 'Summary Points'],
        )

    result = _call_llm(_build_prompt(text, 'PDF documents'))
    if 'error' in result:
        return result

    return _normalize_result(
        result,
        fallback_subject='Scanned PDF',
        fallback_summary='A PDF was uploaded and analyzed for study concepts and revision prompts.',
    )
