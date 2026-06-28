import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getAllTasks, submitFeedback, getSubjects } from '../api/client';
import { CheckCircle2, XCircle, Clock, Flame, Filter, MessageSquare } from 'lucide-react';
import './Feedback.css';

const STATUS_COLORS = {
  completed: '#10b981',
  skipped: '#ef4444',
  missed: '#ef4444',
  pending: '#7c3aed',
};

export default function Feedback() {
  const { userId, addToast } = useApp();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [feedbackState, setFeedbackState] = useState({});
  const [submitting, setSubmitting] = useState(null);

  useEffect(() => {
    if (!userId) { navigate('/'); return; }
    loadData();
  }, [userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [taskRes, subjectRes] = await Promise.all([
        getAllTasks(userId),
        getSubjects(userId),
      ]);
      setTasks(taskRes.data);
      setSubjects(subjectRes.data);

      // Initialize feedback state for pending tasks
      const init = {};
      taskRes.data.forEach(t => {
        if (t.status === 'pending') {
          init[t.id] = {
            status: 'completed',
            difficulty_feedback: t.difficulty_feedback || 3,
            hours_studied: t.duration_hours,
            notes: '',
          };
        }
      });
      setFeedbackState(init);
    } catch { addToast('Failed to load tasks', 'error'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (taskId) => {
    const fb = feedbackState[taskId];
    if (!fb) return;
    setSubmitting(taskId);
    try {
      await submitFeedback({
        task_id: taskId,
        ...fb,
        hours_studied: parseFloat(fb.hours_studied) || 1,
      });
      addToast('Session logged & schedule adapted! 🎯', 'success');
      await loadData();
    } catch { addToast('Failed to submit', 'error'); }
    finally { setSubmitting(null); }
  };

  const updateFb = (taskId, field, value) => {
    setFeedbackState(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], [field]: value }
    }));
  };

  const filtered = tasks.filter(t => {
    if (filterSubject !== 'all' && t.subject_id !== parseInt(filterSubject)) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    return true;
  });

  if (loading) return (
    <div className="page-container"><div className="loading-screen"><div className="spinner" /></div></div>
  );

  return (
    <div className="page-container feedback-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Session Feedback</h1>
          <p className="page-subtitle">Log your study sessions so the AI can adapt your schedule</p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card filters-bar">
        <div className="filter-group">
          <Filter size={16} style={{ color: 'var(--accent-purple-light)' }} />
          <select id="filter-status" className="form-select filter-select"
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="skipped">Skipped</option>
            <option value="missed">Missed</option>
          </select>
          <select id="filter-subject" className="form-select filter-select"
            value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
            <option value="all">All Subjects</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {filtered.length} tasks
        </span>
      </div>

      {/* Task Cards */}
      {filtered.length === 0 ? (
        <div className="empty-state glass-card">
          <div className="empty-icon"><MessageSquare size={40} style={{ opacity: 0.3 }} /></div>
          <div className="empty-title">No tasks match the filter</div>
          <div className="empty-desc">Try changing the filters above.</div>
        </div>
      ) : (
        <div className="feedback-list">
          {filtered.map(task => {
            const fb = feedbackState[task.id];
            const isPending = task.status === 'pending';

            return (
              <div key={task.id} className={`glass-card feedback-task-card ${task.status}`}
                id={`feedback-task-${task.id}`}>
                <div className="ftask-header">
                  <div className="ftask-info">
                    <div className="status-dot" style={{ background: STATUS_COLORS[task.status] }} />
                    <div>
                      <div className="ftask-subject">{task.subject_name}</div>
                      {task.topic_name && <div className="ftask-topic">📌 {task.topic_name}</div>}
                    </div>
                  </div>
                  <div className="ftask-meta">
                    <span><Clock size={13} /> {task.scheduled_time}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{task.scheduled_date}</span>
                    <span>{task.duration_hours}h</span>
                    <span className="priority-badge" style={{
                      color: task.priority_score >= 7 ? '#ef4444' : task.priority_score >= 5 ? '#f59e0b' : '#10b981'
                    }}>
                      <Flame size={12} /> {task.priority_score?.toFixed(1)}
                    </span>
                  </div>
                </div>

                {isPending && fb ? (
                  <div className="ftask-feedback-form">
                    <div className="fb-row">
                      <span className="fb-label">Status</span>
                      <div className="status-toggle">
                        {[
                          { val: 'completed', icon: <CheckCircle2 size={14} />, label: 'Done' },
                          { val: 'skipped', icon: <XCircle size={14} />, label: 'Skip' },
                        ].map(({ val, icon, label }) => (
                          <button key={val} id={`btn-${task.id}-${val}`}
                            className={`toggle-btn ${fb.status === val ? 'active-' + val : ''}`}
                            onClick={() => updateFb(task.id, 'status', val)}>
                            {icon} {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {fb.status === 'completed' && (
                      <>
                        <div className="fb-row">
                          <span className="fb-label">Hours</span>
                          <input type="number" step="0.5" min="0.5" max="12"
                            className="form-input fb-number"
                            value={fb.hours_studied}
                            onChange={e => updateFb(task.id, 'hours_studied', e.target.value)} />
                        </div>
                        <div className="fb-row">
                          <span className="fb-label">Difficulty</span>
                          <div className="diff-scale">
                            {[
                              { v: 1, label: '😊 Easy' },
                              { v: 2, label: '🙂 Okay' },
                              { v: 3, label: '😐 Medium' },
                              { v: 4, label: '😓 Hard' },
                              { v: 5, label: '😰 Very Hard' },
                            ].map(({ v, label }) => (
                              <button key={v} id={`btn-diff-${task.id}-${v}`}
                                className={`diff-scale-btn ${fb.difficulty_feedback === v ? 'active' : ''}`}
                                onClick={() => updateFb(task.id, 'difficulty_feedback', v)}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <div className="fb-row" style={{ alignItems: 'flex-start' }}>
                      <span className="fb-label">Notes</span>
                      <textarea className="form-input fb-notes" rows={2} placeholder="Optional notes..."
                        value={fb.notes} onChange={e => updateFb(task.id, 'notes', e.target.value)} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                      <button id={`btn-submit-${task.id}`} className="btn btn-primary btn-sm"
                        onClick={() => handleSubmit(task.id)}
                        disabled={submitting === task.id}>
                        {submitting === task.id ? 'Saving...' : '✓ Submit & Adapt'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="ftask-logged">
                    {task.status === 'completed' ? (
                      <span style={{ color: 'var(--accent-green)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <CheckCircle2 size={14} /> Completed
                        {task.difficulty_feedback && ` · Difficulty: ${task.difficulty_feedback}/5`}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--accent-red)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <XCircle size={14} /> {task.status} – will be rescheduled
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
