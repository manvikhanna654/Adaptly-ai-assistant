import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getTodaySchedule, submitFeedback, getAnalytics } from '../api/client';
import PomodoroTimer from '../components/PomodoroTimer';
import { Target, CheckCircle2, XCircle, AlertTriangle, ChevronRight } from 'lucide-react';
import './Timer.css';

export default function TimerPage() {
  const { userId, addToast } = useApp();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [avgQuality, setAvgQuality] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [feedbackTask, setFeedbackTask] = useState(null);
  const [feedbackData, setFeedbackData] = useState({
    status: 'completed', difficulty_feedback: 3, confidence_rating: 3,
    hours_studied: '', notes: '',
  });

  useEffect(() => {
    if (!userId) {
      navigate('/');
      return;
    }
    loadData();
  }, [userId, navigate]);

  const loadData = async () => {
    try {
      const [todayRes, analyticsRes] = await Promise.all([
        getTodaySchedule(userId),
        getAnalytics(userId)
      ]);
      const data = todayRes.data;
      const todayTasks = Array.isArray(data) ? data : (data.tasks || []);
      setTasks(todayTasks.filter(t => t.status === 'pending'));
      setAvgQuality(analyticsRes.data?.stats?.avg_quality_score ?? null);
    } catch (err) {
      addToast('Failed to load tasks', 'error');
    }
  };

  const openFeedback = (task) => {
    setFeedbackTask(task);
    setFeedbackData({
      status: 'completed',
      difficulty_feedback: task?.difficulty_feedback || 3,
      confidence_rating: 3,
      hours_studied: task?.duration_hours || '',
      notes: '',
    });
  };

  const submitTaskFeedback = async () => {
    try {
      await submitFeedback({
        task_id: feedbackTask.id,
        ...feedbackData,
        hours_studied: parseFloat(feedbackData.hours_studied) || feedbackTask.duration_hours || 0.5,
      });
      setFeedbackTask(null);
      setActiveTask(null);
      await loadData();
      addToast('Session logged! Schedule updated 🎯', 'success');
    } catch {
      addToast('Failed to submit feedback', 'error');
    }
  };

  return (
    <div className="page-container timer-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pomodoro Timer</h1>
          <p className="page-subtitle">Focus on your studies with adaptive timer sessions</p>
        </div>
      </div>

      <div className="timer-layout">
        {/* Left Side: Task Selection */}
        <div className="timer-sidebar glass-card">
          <h2 className="timer-sidebar-title">
            <Target size={18} /> Select Task
          </h2>
          
          <div className="timer-task-list">
            <button
              className={`timer-task-btn ${activeTask === null ? 'active' : ''}`}
              onClick={() => setActiveTask(null)}
            >
              <div className="timer-task-name">Free Session (No Task)</div>
            </button>
            
            {tasks.map((task) => (
              <button
                key={task.id}
                className={`timer-task-btn ${activeTask?.id === task.id ? 'active' : ''}`}
                onClick={() => setActiveTask(task)}
              >
                <div className="timer-task-name">{task.subject_name}</div>
                {task.topic_name && <div className="timer-task-topic">📌 {task.topic_name}</div>}
                <div className="timer-task-meta">{task.duration_hours}h scheduled</div>
              </button>
            ))}
            
            {tasks.length === 0 && (
              <div className="timer-empty-msg">
                No pending tasks for today. Generating a schedule can provide intelligent task recommendations!
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Timer */}
        <div className="timer-main-view glass-card">
          <div className="timer-container-large">
            <PomodoroTimer
              task={activeTask}
              avgQualityScore={avgQuality}
              onSessionDone={(task) => {
                if (task) {
                  openFeedback(task);
                } else {
                  addToast('Free session completed!', 'success');
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Feedback Modal ── */}
      {feedbackTask && (
        <div className="modal-overlay" onClick={() => setFeedbackTask(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} id="feedback-modal">
            <h3 className="modal-title">Log Session: {feedbackTask.subject_name}</h3>
            {feedbackTask.topic_name && (
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Topic: {feedbackTask.topic_name}
              </p>
            )}

            <div className="modal-form">
              <div className="form-group">
                <label className="form-label">Session Status</label>
                <div className="status-btns">
                  {[
                    { val: 'completed', label: '✅ Completed', color: 'var(--accent-green)' },
                    { val: 'skipped', label: '⏭️ Skipped', color: 'var(--accent-orange)' },
                  ].map(({ val, label, color }) => (
                    <button
                      key={val}
                      id={`btn-status-${val}`}
                      className={`status-btn ${feedbackData.status === val ? 'active' : ''}`}
                      style={{ '--btn-color': color }}
                      onClick={() => setFeedbackData((p) => ({ ...p, status: val }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {feedbackData.status === 'completed' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Hours Studied</label>
                    <input
                      id="input-hours-studied"
                      type="number" step="0.5" min="0.5" max="12"
                      className="form-input"
                      placeholder={feedbackTask.duration_hours}
                      value={feedbackData.hours_studied}
                      onChange={(e) => setFeedbackData((p) => ({ ...p, hours_studied: e.target.value }))}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Difficulty (1=Easy, 5=Very Hard)</label>
                    <div className="diff-btns">
                      {[1, 2, 3, 4, 5].map((d) => (
                        <button
                          key={d}
                          id={`btn-diff-${d}`}
                          className={`diff-btn ${feedbackData.difficulty_feedback === d ? 'active' : ''}`}
                          onClick={() => setFeedbackData((p) => ({ ...p, difficulty_feedback: d }))}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Confidence Rating (1=Low, 5=Very High)</label>
                    <div className="diff-btns">
                      {[1, 2, 3, 4, 5].map((c) => (
                        <button
                          key={c}
                          id={`btn-conf-${c}`}
                          className={`diff-btn ${feedbackData.confidence_rating === c ? 'active' : ''}`}
                          onClick={() => setFeedbackData((p) => ({ ...p, confidence_rating: c }))}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <textarea
                  id="input-notes"
                  className="form-input form-textarea"
                  placeholder="Any notes about this session..."
                  rows={3}
                  value={feedbackData.notes}
                  onChange={(e) => setFeedbackData((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setFeedbackTask(null)} id="btn-cancel-feedback">Cancel</button>
              <button className="btn btn-primary" onClick={submitTaskFeedback} id="btn-submit-feedback">
                Submit & Update Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
