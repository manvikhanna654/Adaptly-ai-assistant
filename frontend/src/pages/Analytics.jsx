import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getAnalytics, getHistory } from '../api/client';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { TrendingUp, Clock, Target, Flame, Award, BookOpen, History } from 'lucide-react';
import './Analytics.css';

const CHART_COLORS = [
  '#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#ec4899',
  '#8b5cf6', '#0ea5e9', '#14b8a6', '#f97316', '#d946ef'
];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-label">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const STATUS_COLORS = {
  completed: '#10b981',
  skipped: '#ef4444',
  missed: '#f59e0b',
  pending: '#7c3aed',
};

export default function Analytics() {
  const { userId, addToast } = useApp();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (!userId) { navigate('/'); return; }
    loadData();
  }, [userId]);

  // Also re-fetch when window regains focus (user logged something on Dashboard)
  useEffect(() => {
    const onFocus = () => { if (userId) loadData(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [anaRes, histRes] = await Promise.all([
        getAnalytics(userId),
        getHistory(userId, 30),
      ]);
      setAnalytics(anaRes.data);
      setHistory(histRes.data);
    } catch { addToast('Failed to load analytics', 'error'); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="page-container"><div className="loading-screen"><div className="spinner" /></div></div>
  );

  if (!analytics) return null;

  const { stats, subject_time, trend, hours_trend } = analytics;
  // hours_trend is 91 days (for heatmap); slice to last 7 for the bar chart
  const hours7 = hours_trend ? hours_trend.slice(-7) : [];

  const STAT_CARDS = [
    { label: 'Total Tasks', value: stats.total_tasks, icon: <Target size={20} />, color: 'var(--accent-purple-light)' },
    { label: 'Completed', value: stats.completed_tasks, icon: <Award size={20} />, color: 'var(--accent-green)' },
    { label: 'Completion Rate', value: `${stats.completion_rate}%`, icon: <TrendingUp size={20} />, color: 'var(--accent-cyan)' },
    { label: 'Hours Studied', value: `${stats.total_hours}h`, icon: <Clock size={20} />, color: 'var(--accent-orange)' },
    { label: 'Study Streak', value: `${stats.streak}d`, icon: <Flame size={20} />, color: 'var(--accent-red)' },
    { label: 'Active Subjects', value: subject_time.length, icon: <BookOpen size={20} />, color: 'var(--accent-pink)' },
  ];

  return (
    <div className="page-container analytics-page">
      <div className="page-header" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <h1 className="page-title">Analytics &amp; Insights</h1>
          <p className="page-subtitle">Track your learning performance and patterns</p>
        </div>
        <button id="btn-refresh-analytics" className="btn btn-secondary" onClick={loadData}>
          <TrendingUp size={16} /> Refresh
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="analytics-tabs">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'trends', label: 'Trends' },
          { id: 'subjects', label: 'Subjects' },
          { id: 'history', label: 'History' },
        ].map(({ id, label }) => (
          <button key={id} id={`tab-${id}`}
            className={`analytics-tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div className="animate-fade-up">
          {/* Stats Grid */}
          <div className="grid-3 stats-grid">
            {STAT_CARDS.map((s, i) => (
              <div key={i} className="glass-card stat-mini">
                <div className="stat-mini-icon" style={{ color: s.color }}>{s.icon}</div>
                <div className="stat-mini-value" style={{ color: s.color }}>{s.value}</div>
                <div className="stat-mini-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Two charts */}
          <div className="grid-2 charts-row">
            {/* Completion Trend */}
            <div className="glass-card">
              <h3 className="chart-title">14-Day Completion Rate</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="rate" name="Complete %" stroke="#7c3aed"
                    strokeWidth={2} fill="url(#grad1)" dot={{ fill: '#7c3aed', r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Hours per day */}
            <div className="glass-card">
              <h3 className="chart-title">Daily Study Hours (Last 7 Days)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hours7} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="hours" name="Hours" fill="url(#grad2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Subject Pie */}
          {subject_time.length > 0 && (
            <div className="glass-card">
              <h3 className="chart-title">Time Distribution by Subject</h3>
              <div className="pie-chart-container">
                <ResponsiveContainer width="50%" height={260}>
                  <PieChart>
                    <Pie data={subject_time} dataKey="hours" nameKey="name"
                      cx="50%" cy="50%" outerRadius={100} innerRadius={50}
                      paddingAngle={3}>
                      {subject_time.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pie-legend">
                  {subject_time.map((s, i) => (
                    <div key={i} className="pie-legend-item">
                      <div className="pie-legend-dot"
                        style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="pie-legend-name">{s.name}</span>
                      <span className="pie-legend-val">{s.hours}h</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Trends Tab ── */}
      {activeTab === 'trends' && (
        <div className="animate-fade-up">
          <div className="glass-card">
            <h3 className="chart-title">Completed vs Skipped – 14 Day Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="skipped" name="Skipped/Missed" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card" style={{ marginTop: '1.5rem' }}>
            <h3 className="chart-title">Task Completion Rate – Last 14 Days</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="rate" name="Rate %" stroke="#7c3aed"
                  strokeWidth={2.5} dot={{ fill: '#7c3aed', r: 4 }}
                  activeDot={{ r: 6, fill: '#a855f7' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Subjects Tab ── */}
      {activeTab === 'subjects' && (
        <div className="animate-fade-up">
          <div className="glass-card">
            <h3 className="chart-title">Subject Priority Scores</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={subject_time} layout="vertical"
                margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" domain={[0, 10]} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="priority" name="Priority" radius={[0, 4, 4, 0]}>
                  {subject_time.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Subject performance table */}
          <div className="glass-card" style={{ marginTop: '1.5rem' }}>
            <h3 className="chart-title">Subject Performance Summary</h3>
            <div className="perf-table">
              <div className="perf-table-header">
                <span>Subject</span>
                <span>Priority</span>
                <span>Proficiency</span>
                <span>Completion</span>
                <span>Hours</span>
              </div>
              {subject_time.map((s, i) => (
                <div key={i} className="perf-table-row">
                  <span className="perf-subject">
                    <div className="perf-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    {s.name}
                  </span>
                  <span className="perf-val" style={{
                    color: s.priority >= 7 ? '#ef4444' : s.priority >= 5 ? '#f59e0b' : '#10b981'
                  }}>
                    {s.priority}/10
                  </span>
                  <span className="perf-val">
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {Array.from({ length: 5 }, (_, k) => (
                        <div key={k} style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: k < s.proficiency ? '#06b6d4' : 'var(--border-subtle)'
                        }} />
                      ))}
                    </div>
                  </span>
                  <span className="perf-val">
                    <div className="progress-bar-container" style={{ width: '80px' }}>
                      <div className="progress-bar-fill" style={{
                        width: `${s.completion_rate}%`,
                        background: s.completion_rate >= 70 ? '#10b981' : s.completion_rate >= 40 ? '#f59e0b' : '#ef4444'
                      }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.completion_rate}%</span>
                  </span>
                  <span className="perf-val">{s.hours}h</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── History Tab ── */}
      {activeTab === 'history' && (
        <div className="animate-fade-up">
          <div className="glass-card">
            <div className="section-title-row">
              <History size={18} style={{ color: 'var(--accent-purple-light)' }} />
              <h3 className="chart-title" style={{ margin: 0 }}>Session History</h3>
            </div>
            {history.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <div className="empty-title">No history yet</div>
                <div className="empty-desc">Complete study sessions to build your history.</div>
              </div>
            ) : (
              <div className="history-list">
                {history.map((log, i) => (
                  <div key={i} className="history-item">
                    <div className="h-status-dot"
                      style={{ background: STATUS_COLORS[log.status] || '#7c3aed' }} />
                    <div className="h-info">
                      <div className="h-subject">{log.subject_name}</div>
                      <div className="h-date">{log.date}</div>
                    </div>
                    <div className="h-meta">
                      {log.hours_studied > 0 && (
                        <span className="badge badge-cyan">{log.hours_studied}h</span>
                      )}
                      {log.difficulty_feedback && (
                        <span className="badge badge-orange">Diff: {log.difficulty_feedback}/5</span>
                      )}
                      <span className={`badge badge-${log.status === 'completed' ? 'green' : log.status === 'pending' ? 'purple' : 'red'}`}>
                        {log.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
