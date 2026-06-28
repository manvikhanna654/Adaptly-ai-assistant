import sys
sys.path.insert(0, '.')
from app import app
import json, datetime

with app.test_client() as c:
    r = c.post('/api/user', json={'name':'DateTest', 'daily_hours': 4, 'peak_time':'morning'})
    uid = json.loads(r.data)['user_id']
    c.post('/api/subjects', json={'user_id': uid, 'name':'Math', 'proficiency': 3, 'difficulty': 3})
    r = c.post('/api/schedule/generate/{}'.format(uid), json={'days': 7})
    print('Generate:', r.status_code, json.loads(r.data))

    r = c.get('/api/tasks/{}'.format(uid))
    tasks = json.loads(r.data)

    today = datetime.date.today().isoformat()
    future = [t for t in tasks if t.get('scheduled_date','') > today]
    target = future[0] if future else tasks[0]
    print('Logging task scheduled for:', target['scheduled_date'], '(today is', today, ')')

    r = c.post('/api/tasks/feedback', json={
        'task_id': target['id'], 'status': 'completed',
        'difficulty_feedback': 3, 'confidence_rating': 4,
        'hours_studied': 1.5
    })
    print('Feedback:', r.status_code)

    r = c.get('/api/analytics/{}'.format(uid))
    data = json.loads(r.data)
    hours_trend = data.get('hours_trend', [])
    non_zero = [d for d in hours_trend if d.get('hours', 0) > 0]
    print('Non-zero days in hours_trend:', non_zero)
    print('Total hours in stats:', data['stats']['total_hours'])
