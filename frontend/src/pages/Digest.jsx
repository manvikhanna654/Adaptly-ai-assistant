import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getAnalytics, getInsights, getTodaySchedule } from '../api/client';
import { Brain, Star, Calendar, Zap, BookOpen, TrendingUp } from 'lucide-react';
import './Digest.css';

const DIGEST_KEY = 'last_digest_date';

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

export function shouldShowDigest() {
  const last = localStorage.getItem(DIGEST_KEY);
  return last !== getTodayStr();
}

export function markDigestShown() {
  localStorage.setItem(DIGEST_KEY, getTodayStr());
}

const GREETINGS = ['Good morning', 'Good afternoon', 'Good evening'];
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return GREETINGS[0];
  if (h < 17) return GREETINGS[1];
  return GREETINGS[2];
}

export default function Digest() {
  const { user } = useApp();
  const userId = user?.id;
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [insights, setInsights] = useState({ insights: [], recommendations: [] });
  const [todayTasks, setTodayTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return; // wait for user to load; PrivateRoute handles redirect
    Promise.all([
      getAnalytics(userId),
      getInsights(userId),
      getTodaySchedule(userId),
    ]).then(([a, ins, sched]) => {
      setAnalytics(a.data);
      setInsights(ins.data);
      // handle new response shape (tasks vs array)
      const tasks = Array.isArray(sched.data) ? sched.data : (sched.data.tasks || []);
      setTodayTasks(tasks);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [userId]);

  const handleStart = () => {
    markDigestShown();
    navigate('/dashboard');
  };

  const stats = analytics?.stats || {};
  const streak = stats.streak || 0;

  // Yesterday's recap from trend (last completed day before today)
  const trend = analytics?.trend || [];
  const yesterday = trend[trend.length - 2] || {};

  // Today's plan
  const totalTodayHours = todayTasks.reduce((s, t) => s + (t.duration_hours || 0), 0).toFixed(1);

  // Top insight
  const topInsight = insights.insights?.[0] || null;

  // Exam countdown from subjects (extracted from today tasks)
  const examsFromTasks = todayTasks
    .filter((t) => t.exam_date)
    .map((t) => ({
      name: t.subject_name,
      days: Math.max(0, Math.round((new Date(t.exam_date) - new Date()) / 86400000)),
    }));
  const uniqueExams = Object.values(
    examsFromTasks.reduce((acc, e) => { acc[e.name] = e; return acc; }, {})
  );

  // Best subject from analytics
  const bestSubject = analytics?.subject_time?.sort((a, b) => b.proficiency - a.proficiency)?.[0];

  if (loading) {
    return (
      <div className="digest-page">
        <div className="digest-loading">
          <Brain size={32} className="spin" />
          <p>Preparing your daily digest…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="digest-page">
      <div className="digest-bg">
        <div className="digest-orb digest-orb-1" />
        <div className="digest-orb digest-orb-2" />
      </div>

      <div className="digest-container">
        {/* 1. Greeting Header */}
        <div className="digest-greeting animate-fade-up">
          <div className="digest-logo"><Brain size={36} /></div>
          <h1>{getGreeting()}, {user?.name?.split(' ')[0] || 'Scholar'}! ☀️</h1>
          <p className="digest-date">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <div className="digest-streak-badge">
            🔥 {streak} day streak
          </div>
        </div>

        {/* 2. Yesterday Recap */}
        <div className="digest-section animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="digest-section-title">
            <TrendingUp size={18} /> Yesterday's Recap
          </div>
          <div className="digest-recap-grid">
            <div className="digest-recap-item">
              <span className="recap-val">{yesterday.completed ?? '—'}</span>
              <span className="recap-label">Tasks Done</span>
            </div>
            <div className="digest-recap-item">
              <span className="recap-val">
                {analytics?.hours_trend?.[analytics.hours_trend.length - 2]?.hours?.toFixed(1) ?? '—'}h
              </span>
              <span className="recap-label">Hours Logged</span>
            </div>
            <div className="digest-recap-item">
              <span className="recap-val">
                {stats.avg_quality_score != null ? (stats.avg_quality_score * 100).toFixed(0) + '%' : '—'}
              </span>
              <span className="recap-label">Avg Quality</span>
            </div>
            <div className="digest-recap-item">
              <span className="recap-val">{bestSubject?.name?.split(' ')[0] ?? '—'}</span>
              <span className="recap-label">Best Subject</span>
            </div>
          </div>
        </div>

        {/* 3. Today's Plan */}
        <div className="digest-section animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="digest-section-title">
            <Calendar size={18} /> Today's Plan · {totalTodayHours}h total
          </div>
          <div className="digest-task-list">
            {todayTasks.length === 0 && (
              <div className="digest-empty">No tasks scheduled yet. Generate your plan first.</div>
            )}
            {todayTasks.map((task, i) => (
              <div key={i} className="digest-task-item">
                <span className="digest-task-num">{i + 1}</span>
                <span className="digest-task-name">{task.subject_name}</span>
                {task.topic_name && <span className="digest-task-topic">· {task.topic_name}</span>}
                <span className="digest-task-time">{task.duration_hours}h</span>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Highlighted AI Insight */}
        {topInsight && (
          <div className={`digest-section animate-fade-up digest-insight insight-${topInsight.type}`} style={{ animationDelay: '0.3s' }}>
            <div className="digest-section-title">
              <Star size={18} /> AI Insight
            </div>
            <div className="digest-insight-body">
              <span className="digest-insight-icon">{topInsight.icon}</span>
              <span>{topInsight.message}</span>
            </div>
          </div>
        )}

        {/* 5. Exam Countdown Chips */}
        {uniqueExams.length > 0 && (
          <div className="digest-section animate-fade-up" style={{ animationDelay: '0.4s' }}>
            <div className="digest-section-title">
              <Zap size={18} /> Exam Countdowns
            </div>
            <div className="digest-exam-chips">
              {uniqueExams.map((exam, i) => (
                <div key={i} className={`exam-chip ${exam.days <= 7 ? 'urgent' : ''}`}>
                  <span>{exam.name}</span>
                  <span className="exam-chip-days">· {exam.days}d</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="digest-actions animate-fade-up" style={{ animationDelay: '0.5s' }}>
          <button id="btn-digest-start" className="btn-digest-start" onClick={handleStart}>
            <BookOpen size={20} /> Start studying
          </button>
        </div>
      </div>
    </div>
  );
}
