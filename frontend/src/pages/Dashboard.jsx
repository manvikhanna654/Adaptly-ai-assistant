import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  getTodaySchedule, getWeekSchedule, getInsights, getSubjects,
  generateSchedule, submitFeedback, runAdaptiveUpdate, getAnalytics
} from '../api/client';
import {
  Calendar, Clock, TrendingUp, Flame, CheckCircle2, XCircle,
  AlertTriangle, Star, RefreshCw, ChevronRight, Target, Zap, BookOpen,
  Maximize2, Minimize2, Timer
} from 'lucide-react';
import PomodoroTimer from '../components/PomodoroTimer';
import Heatmap from '../components/Heatmap';
import './Dashboard.css';

const STATUS_COLORS = {
  completed: 'var(--accent-green)',
  skipped: 'var(--accent-red)',
  missed: 'var(--accent-red)',
  pending: 'var(--accent-purple-light)',
};

const PRIORITY_COLOR = (score) => {
  if (score >= 8) return 'var(--accent-red)';
  if (score >= 6) return 'var(--accent-orange)';
  if (score >= 4) return 'var(--accent-cyan)';
  return 'var(--accent-green)';
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Dashboard() {
  const { userId, user, addToast } = useApp();
  const navigate = useNavigate();
  const [todayTasks, setTodayTasks] = useState([]);
  const [weekTasks, setWeekTasks] = useState([]);
  const [insights, setInsights] = useState({ insights: [], recommendations: [] });
  const [subjects, setSubjects] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedbackTask, setFeedbackTask] = useState(null);
  const [feedbackData, setFeedbackData] = useState({
    status: 'completed', difficulty_feedback: 3, confidence_rating: 3,
    hours_studied: '', notes: '',
  });
  const [regenerating, setRegenerating] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [burnoutInfo, setBurnoutInfo] = useState(null);
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem('focus_mode') === '1');
  const [activeTimerTask, setActiveTimerTask] = useState(null);
  const [showTimer, setShowTimer] = useState(false);

  const avgQuality = analytics?.stats?.avg_quality_score ?? null;

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    // Fire-and-forget — don't let adaptive update failure block the dashboard
    runAdaptiveUpdate(userId).catch(() => {});
    try {
      const [todayRes, weekRes, insightRes, subjectRes, analyticsRes] = await Promise.all([
        getTodaySchedule(userId),
        getWeekSchedule(userId),
        getInsights(userId),
        getSubjects(userId),
        getAnalytics(userId),
      ]);

      // today schedule now returns { tasks, burnout_detected, burnout_reason }
      const todayData = todayRes.data;
      if (Array.isArray(todayData)) {
        setTodayTasks(todayData);
      } else {
        setTodayTasks(todayData.tasks || []);
        if (todayData.burnout_detected) {
          setBurnoutInfo({ detected: true, reason: todayData.burnout_reason });

          // Auto-add burnout insight
          const burnoutIns = {
            type: 'warning',
            subject: 'All',
            message: `Burnout detected: ${todayData.burnout_reason} Today's sessions reduced by 40%.`,
            icon: '🛑',
            severity: 'warning',
          };
          setInsights((prev) => ({
            ...prev,
            insights: [burnoutIns, ...(prev.insights || [])],
          }));
        }
      }

      setWeekTasks(weekRes.data);
      setInsights(insightRes.data);
      setSubjects(subjectRes.data);
      setAnalytics(analyticsRes.data);
    } catch (err) {
      console.error('Dashboard load error:', err?.response?.data || err?.message || err);
      addToast('Failed to load dashboard. Is the backend running?', 'error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) { navigate('/'); return; }
    loadData();
  }, [userId]);

  // Focus mode keyboard shortcut: press F
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'f' || e.key === 'F') {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          setFocusMode((v) => {
            localStorage.setItem('focus_mode', v ? '0' : '1');
            return !v;
          });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleFocusMode = () => {
    setFocusMode((v) => {
      localStorage.setItem('focus_mode', v ? '0' : '1');
      return !v;
    });
  };

  const handleRegenerateSchedule = async () => {
    setRegenerating(true);
    try {
      await generateSchedule(userId, 7);
      await loadData();
      addToast('Schedule regenerated successfully!', 'success');
    } catch {
      addToast('Failed to regenerate schedule', 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const openFeedback = (task) => {
    setFeedbackTask(task);
    setFeedbackData({
      status: 'completed',
      difficulty_feedback: task.difficulty_feedback || 3,
      confidence_rating: 3,
      hours_studied: task.duration_hours || '',
      notes: '',
    });
  };

  const submitTaskFeedback = async () => {
    try {
      await submitFeedback({
        task_id: feedbackTask.id,
        ...feedbackData,
        hours_studied: parseFloat(feedbackData.hours_studied) || feedbackTask.duration_hours,
      });
      setFeedbackTask(null);
      await loadData();
      addToast('Session logged! Schedule updated 🎯', 'success');
    } catch {
      addToast('Failed to submit feedback', 'error');
    }
  };

  // Compute stats
  const completedToday = todayTasks.filter((t) => t.status === 'completed').length;
  const totalToday = todayTasks.length;
  const completionPct = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

  // Group week tasks by date
  const weekByDate = weekTasks.reduce((acc, t) => {
    if (!acc[t.scheduled_date]) acc[t.scheduled_date] = [];
    acc[t.scheduled_date].push(t);
    return acc;
  }, {});

  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const displayTasks = selectedDay
    ? weekByDate[selectedDay] || []
    : todayTasks;

  const todayStr = today.toISOString().split('T')[0];
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  const hoursData = analytics?.hours_trend || [];

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-screen">
          <div className="spinner" />
          <p>Loading your personalized dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`page-container dashboard-page ${focusMode ? 'focus-mode' : ''}`}>
      {/* Header */}
      <div className="dashboard-header non-focus-el">
        <div>
          <h1 className="page-title">{greeting}, {user?.name?.split(' ')[0]}! 👋</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            id="btn-focus-mode"
            className="btn btn-ghost"
            onClick={toggleFocusMode}
            title="Focus mode (F)"
            style={{ padding: '0.5rem' }}
          >
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            id="btn-regenerate"
            className={`btn btn-secondary ${regenerating ? 'regenerating' : ''}`}
            onClick={handleRegenerateSchedule}
            disabled={regenerating}
          >
            <RefreshCw size={16} className={regenerating ? 'spin' : ''} />
            {regenerating ? 'Regenerating...' : 'Regenerate Plan'}
          </button>
        </div>
      </div>

      {/* Burnout Banner */}
      {burnoutInfo?.detected && (
        <div className="burnout-banner non-focus-el">
          🛑 <strong>Burnout Detected:</strong> {burnoutInfo.reason}
          <span className="burnout-note"> — Today's sessions automatically reduced by 40%.</span>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid-4 stats-row non-focus-el">
        <div className="glass-card stat-widget" style={{ '--accent': 'var(--accent-purple)' }}>
          <div className="stat-icon"><Target size={20} /></div>
          <div className="stat-value" style={{ color: 'var(--accent-purple-light)' }}>{completionPct}%</div>
          <div className="stat-label">Today's Progress</div>
          <div className="progress-bar-container" style={{ marginTop: '0.5rem' }}>
            <div className="progress-bar-fill" style={{
              width: `${completionPct}%`,
              background: 'var(--gradient-primary)'
            }} />
          </div>
        </div>

        <div className="glass-card stat-widget" style={{ '--accent': 'var(--accent-cyan)' }}>
          <div className="stat-icon"><BookOpen size={20} /></div>
          <div className="stat-value" style={{ color: 'var(--accent-cyan-light)' }}>
            {completedToday}/{totalToday}
          </div>
          <div className="stat-label">Sessions Done</div>
        </div>

        <div className="glass-card stat-widget" style={{ '--accent': 'var(--accent-green)' }}>
          <div className="stat-icon"><Clock size={20} /></div>
          <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
            {todayTasks.filter(t => t.status === 'completed')
              .reduce((s, t) => s + (t.duration_hours || 0), 0).toFixed(1)}h
          </div>
          <div className="stat-label">Hours Studied</div>
        </div>

        <div className="glass-card stat-widget" style={{ '--accent': 'var(--accent-orange)' }}>
          <div className="stat-icon"><TrendingUp size={20} /></div>
          <div className="stat-value" style={{ color: 'var(--accent-orange)' }}>
            {avgQuality != null ? (avgQuality * 100).toFixed(0) + '%' : '—'}
          </div>
          <div className="stat-label">Avg Quality</div>
        </div>
      </div>

      {/* Focus Mode: only show timer + active task */}
      {focusMode && (
        <div className="focus-overlay">
          <div className="focus-content">
            {activeTimerTask ? (
              <PomodoroTimer
                task={activeTimerTask}
                avgQualityScore={avgQuality}
                onSessionDone={(task) => { openFeedback(task); setFocusMode(false); }}
                onClose={() => setActiveTimerTask(null)}
              />
            ) : (
              <div className="focus-pick-task">
                <div style={{ color: '#8b7cf8', marginBottom: '1rem', fontSize: '0.9rem' }}>
                  Select a task to start timer:
                </div>
                {todayTasks.filter(t => t.status === 'pending').map(task => (
                  <button key={task.id} className="focus-task-btn"
                    onClick={() => setActiveTimerTask(task)}>
                    {task.subject_name} — {task.duration_hours}h
                  </button>
                ))}
              </div>
            )}
            <button id="btn-exit-focus" className="btn btn-ghost focus-exit-btn" onClick={toggleFocusMode}>
              <Minimize2 size={14} /> Exit Focus Mode
            </button>
          </div>
        </div>
      )}

      {/* Main Grid — hidden in focus mode */}
      <div className={`dashboard-main-grid non-focus-el`}>
        {/* Left Column */}
        <div className="dashboard-left">
          {/* Weekly Calendar */}
          <div className="glass-card weekly-calendar">
            <div className="section-header">
              <Calendar size={18} />
              <h3>Weekly Overview</h3>
            </div>
            <div className="week-days-row">
              {weekDays.map((day) => {
                const dateStr = day.toISOString().split('T')[0];
                const dayTasks = weekByDate[dateStr] || [];
                const done = dayTasks.filter((t) => t.status === 'completed').length;
                const isToday = dateStr === todayStr;
                const isSelected = selectedDay === dateStr;

                return (
                  <button
                    key={dateStr}
                    id={`week-day-${dateStr}`}
                    className={`week-day-btn ${isToday ? 'is-today' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                  >
                    <span className="day-name">{DAY_NAMES[day.getDay()]}</span>
                    <span className="day-num">{day.getDate()}</span>
                    {dayTasks.length > 0 && (
                      <div className="day-dots">
                        {dayTasks.slice(0, 3).map((t, i) => (
                          <span key={i} className="day-dot"
                            style={{ background: STATUS_COLORS[t.status] || 'var(--accent-purple)' }} />
                        ))}
                      </div>
                    )}
                    {done > 0 && (
                      <span className="day-done">{done}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Heatmap */}
          {hoursData.length > 0 && (
            <div className="glass-card heatmap-section">
              <div className="section-header">
                <Flame size={18} />
                <h3>Activity Heatmap</h3>
              </div>
              <Heatmap hoursData={hoursData} />
            </div>
          )}

          {/* Task List */}
          <div className="glass-card tasks-section">
            <div className="section-header">
              <Zap size={18} />
              <h3>{selectedDay ? `Tasks for ${new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : "Today's Plan"}</h3>
              {selectedDay && (
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDay(null)}>
                  Back to Today
                </button>
              )}
            </div>

            {displayTasks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📚</div>
                <div className="empty-title">No tasks scheduled</div>
                <div className="empty-desc">Click "Regenerate Plan" to create a schedule for this day.</div>
              </div>
            ) : (
              <div className="task-list">
                {displayTasks.map((task) => (
                  <div
                    key={task.id}
                    id={`task-card-${task.id}`}
                    className={`task-item ${task.status}`}
                  >
                    <div className="task-status-indicator"
                      style={{ background: STATUS_COLORS[task.status] || 'var(--accent-purple)' }} />

                    <div className="task-body">
                      <div className="task-top">
                        <div className="task-subject">{task.subject_name}</div>
                        <div className="task-priority-badge" style={{ color: PRIORITY_COLOR(task.priority_score) }}>
                          <Flame size={12} />
                          {task.priority_score?.toFixed(1)}
                        </div>
                      </div>

                      {task.topic_name && (
                        <div className="task-topic">📌 {task.topic_name}</div>
                      )}

                      {/* Goal info */}
                      {task.at_risk && (
                        <div className="task-goal-risk">
                          ⚠️ At risk — needs {task.required_daily_hours}h/day
                        </div>
                      )}

                      <div className="task-meta">
                        <span><Clock size={12} /> {task.scheduled_time}</span>
                        <span>{task.duration_hours}h</span>
                        {task.rescheduled_count > 0 && (
                          <span className="badge badge-orange">Rescheduled ×{task.rescheduled_count}</span>
                        )}
                        <span className={`task-status-badge ${task.status}`}>
                          {task.status === 'completed' ? <CheckCircle2 size={12} /> :
                           task.status === 'skipped' ? <XCircle size={12} /> :
                           task.status === 'missed' ? <AlertTriangle size={12} /> : null}
                          {task.status}
                        </span>
                      </div>
                    </div>

                    {task.status === 'pending' && (
                      <div className="task-actions">
                        <button
                          id={`btn-timer-${task.id}`}
                          className="btn btn-ghost btn-sm"
                          title="Start Pomodoro"
                          onClick={() => { setActiveTimerTask(task); setShowTimer(true); }}
                        >
                          <Timer size={14} />
                        </button>
                        <button
                          id={`btn-log-${task.id}`}
                          className="btn btn-primary btn-sm log-btn"
                          onClick={() => openFeedback(task)}
                        >
                          Log <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="dashboard-right">
          {/* Pomodoro Timer (inline) */}
          {(showTimer && activeTimerTask) && (
            <div className="glass-card">
              <div className="section-header">
                <Timer size={18} />
                <h3>Focus Timer</h3>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0 1rem' }}>
                <PomodoroTimer
                  task={activeTimerTask}
                  avgQualityScore={avgQuality}
                  onSessionDone={(task) => { openFeedback(task); setShowTimer(false); setActiveTimerTask(null); }}
                  onClose={() => { setShowTimer(false); setActiveTimerTask(null); }}
                />
              </div>
            </div>
          )}

          {/* Subject Priority Cards */}
          <div className="glass-card">
            <div className="section-header">
              <TrendingUp size={18} />
              <h3>Subject Priorities</h3>
            </div>
            <div className="subject-priority-list">
              {subjects.map((subj) => (
                <div key={subj.id} className="subject-priority-item">
                  <div className="subj-info">
                    <span className="subj-name">{subj.name}</span>
                    <span className="subj-score" style={{ color: PRIORITY_COLOR(subj.priority_score) }}>
                      {subj.priority_score?.toFixed(1)}
                    </span>
                  </div>
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" style={{
                      width: `${(subj.priority_score / 10) * 100}%`,
                      background: PRIORITY_COLOR(subj.priority_score)
                    }} />
                  </div>
                  <div className="subj-meta">
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Proficiency: {subj.proficiency}/5
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {Math.round((subj.completion_rate || 0) * 100)}% complete
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Insights */}
          <div className="glass-card insights-card">
            <div className="section-header">
              <Star size={18} />
              <h3>AI Insights</h3>
            </div>

            {insights.insights.length === 0 && insights.recommendations.length === 0 ? (
              <div className="empty-state" style={{ padding: '1.5rem' }}>
                <div className="empty-icon">💡</div>
                <div className="empty-title">No insights yet</div>
                <div className="empty-desc">Complete some sessions to see personalized insights.</div>
              </div>
            ) : (
              <>
                <div className="insights-list">
                  {insights.insights.map((ins, i) => (
                    <div key={i} className={`insight-item insight-${ins.type}`}>
                      <span className="insight-icon">{ins.icon}</span>
                      <span className="insight-msg">{ins.message}</span>
                    </div>
                  ))}
                </div>

                {insights.recommendations.length > 0 && (
                  <div className="recommendations">
                    <div className="rec-title">📋 Recommendations</div>
                    {insights.recommendations.map((rec, i) => (
                      <div key={i} className="rec-item">
                        <ChevronRight size={14} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                        {rec}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
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
