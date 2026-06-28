import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { updateMe, addSubject, generateSchedule } from '../api/client';
import { requestNotificationPermission, saveStudyPreferences } from '../utils/notifications';
import { Brain, Plus, Trash2, ChevronRight, Clock, Zap, BookOpen, Target, CheckCircle2 } from 'lucide-react';
import './Onboarding.css';

const DIFFICULTY_LABELS = ['', 'Very Easy', 'Easy', 'Moderate', 'Hard', 'Very Hard'];

const DEFAULT_SUBJECT = {
  name: '',
  difficulty: 3,
  exam_date: '',
  topics: [{ name: '' }],
};

// ── Diagnostic quiz per subject ─────────────────────────────────────
function computeInitialProficiency(comfort, recency, difficulty) {
  // recency_score: Today=1.0, This week=0.7, Last month=0.3, Long time=0.0
  const recencyMap = { today: 1.0, week: 0.7, month: 0.3, long: 0.0 };
  const diffMap = { easy: 1, medium: 2, hard: 3 };
  const recencyScore = recencyMap[recency] ?? 0.5;
  const diffScore = diffMap[difficulty] ?? 2;

  const prof = (comfort / 5) * 0.5 + recencyScore * 0.3 + ((4 - diffScore) / 3) * 0.2;
  // Scale to 1-5
  return Math.round(Math.max(1, Math.min(5, prof * 5)));
}

function DiagnosticQuiz({ subjectName, onComplete }) {
  const [comfort, setComfort] = useState(3);
  const [recency, setRecency] = useState('week');
  const [difficulty, setDifficulty] = useState('medium');

  const handleSubmit = () => {
    const proficiency = computeInitialProficiency(comfort, recency, difficulty);
    onComplete(proficiency);
  };

  return (
    <div className="diagnostic-quiz animate-fade-up">
      <div className="diagnostic-title">
        <Target size={18} /> Diagnosing: <em>{subjectName}</em>
      </div>

      <div className="form-group">
        <label className="form-label">Q1 — Rate your current comfort level</label>
        <div className="comfort-btns">
          {[1, 2, 3, 4, 5].map((c) => (
            <button
              key={c}
              className={`comfort-btn ${comfort === c ? 'active' : ''}`}
              id={`btn-comfort-${c}`}
              onClick={() => setComfort(c)}
            >
              {c}
              <span className="comfort-sublabel">
                {['Beginner', 'Basic', 'Intermediate', 'Advanced', 'Expert'][c - 1]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Q2 — When did you last study this?</label>
        <div className="recency-btns">
          {[
            { val: 'today', label: 'Today' },
            { val: 'week', label: 'This week' },
            { val: 'month', label: 'Last month' },
            { val: 'long', label: 'A long time ago' },
          ].map(({ val, label }) => (
            <button
              key={val}
              className={`recency-btn ${recency === val ? 'active' : ''}`}
              id={`btn-recency-${val}`}
              onClick={() => setRecency(val)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Q3 — How hard do you find this subject?</label>
        <div className="recency-btns">
          {[
            { val: 'easy', label: '😊 Easy' },
            { val: 'medium', label: '😐 Medium' },
            { val: 'hard', label: '😰 Hard' },
          ].map(({ val, label }) => (
            <button
              key={val}
              className={`recency-btn ${difficulty === val ? 'active' : ''}`}
              id={`btn-subj-diff-${val}`}
              onClick={() => setDifficulty(val)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" id="btn-quiz-next" onClick={handleSubmit} style={{ width: '100%' }}>
        Next →
      </button>
    </div>
  );
}

function ResultsScreen({ subjects, onFinish }) {
  return (
    <div className="results-screen animate-fade-up">
      <div className="results-header">
        <CheckCircle2 size={28} style={{ color: '#10b981' }} />
        <h2>Your Starting Levels</h2>
        <p>Based on your answers, we've set your initial proficiency:</p>
      </div>
      <div className="results-list">
        {subjects.map((s, i) => (
          <div key={i} className="result-row">
            <span className="result-name">{s.name}</span>
            <div className="result-bar-container">
              <div className="result-bar-fill" style={{ width: `${(s.proficiency / 5) * 100}%` }} />
            </div>
            <span className="result-val">{s.proficiency}/5</span>
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-lg" id="btn-results-finish" onClick={onFinish} style={{ width: '100%', marginTop: '1.5rem' }}>
        Generate My Study Plan 🚀
      </button>
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(1); // 1=user info, 2=subjects, 3=quiz, 4=results
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    daily_hours: 4,
    peak_time: 'morning',
  });
  const [subjects, setSubjects] = useState([{ ...DEFAULT_SUBJECT }]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizResults, setQuizResults] = useState([]); // computed proficiency per subject

  const { user, setUser, addToast } = useApp();
  const navigate = useNavigate();

  // ── Step 1: User Setup ──────────────────────────
  const handleUserChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // ── Step 2: Subjects ────────────────────────────
  const addSubjectRow = () => {
    setSubjects((prev) => [...prev, { ...DEFAULT_SUBJECT, topics: [{ name: '' }] }]);
  };

  const removeSubjectRow = (i) => {
    setSubjects((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateSubject = (i, field, value) => {
    setSubjects((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const addTopic = (subjectIdx) => {
    setSubjects((prev) => {
      const next = [...prev];
      next[subjectIdx] = {
        ...next[subjectIdx],
        topics: [...next[subjectIdx].topics, { name: '' }],
      };
      return next;
    });
  };

  const updateTopic = (subjectIdx, topicIdx, value) => {
    setSubjects((prev) => {
      const next = [...prev];
      const topics = [...next[subjectIdx].topics];
      topics[topicIdx] = { name: value };
      next[subjectIdx] = { ...next[subjectIdx], topics };
      return next;
    });
  };

  const removeTopic = (subjectIdx, topicIdx) => {
    setSubjects((prev) => {
      const next = [...prev];
      next[subjectIdx] = {
        ...next[subjectIdx],
        topics: next[subjectIdx].topics.filter((_, i) => i !== topicIdx),
      };
      return next;
    });
  };

  // ── Step 2 → Step 3 transition ──────────────────
  const goToQuiz = () => {
    if (subjects.some((s) => !s.name.trim())) {
      addToast('Please fill in all subject names', 'error');
      return;
    }
    setQuizIdx(0);
    setQuizResults([]);
    setStep(3);
  };

  const handleQuizComplete = (proficiency) => {
    const newResults = [...quizResults, proficiency];
    setQuizResults(newResults);
    if (quizIdx + 1 < subjects.length) {
      setQuizIdx(quizIdx + 1);
    } else {
      setStep(4); // show results
    }
  };

  // ── Final Submit ────────────────────────────────
  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      addToast('Please enter your name', 'error');
      return;
    }
    if (!user?.id) {
      addToast('Your session is missing. Please log in again.', 'error');
      return;
    }
    setLoading(true);
    try {
      // Request notification permission
      await requestNotificationPermission();
      saveStudyPreferences({
        peakTime: formData.peak_time,
        subjectName: subjects[0]?.name || '',
        durationMin: 25,
      });

      const uid = user.id;

      for (let i = 0; i < subjects.length; i++) {
        const subj = subjects[i];
        const topicsList = subj.topics.filter((t) => t.name.trim());
        const proficiency = quizResults[i] ?? 3;

        await addSubject({
          name: subj.name,
          proficiency,
          difficulty: subj.difficulty,
          exam_date: subj.exam_date || null,
          topics: topicsList,
        });
      }

      await generateSchedule(uid, 7);
      const userRes = await updateMe(formData);
      setUser(userRes.data);
      addToast('Welcome! Your personalized schedule is ready 🎉', 'success');
      navigate('/digest');
    } catch (err) {
      addToast(err?.response?.data?.error || 'Setup failed. Make sure the backend is running.', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-page">
      {/* Background decoration */}
      <div className="onboarding-bg">
        <div className="bg-orb orb-1" />
        <div className="bg-orb orb-2" />
        <div className="bg-orb orb-3" />
      </div>

      <div className="onboarding-container">
        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-logo">
            <Brain size={32} />
          </div>
          <h1 className="onboarding-title">StudyAI</h1>
          <p className="onboarding-subtitle">
            Your intelligent, adaptive study companion
          </p>
        </div>

        {/* Step Indicators */}
        <div className="step-indicators">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`step-dot ${step >= s ? 'active' : ''} ${step > s ? 'done' : ''}`}>
              <span>{s}</span>
            </div>
          ))}
          <div className={`step-line ${step > 1 ? 'active' : ''}`} />
        </div>

        {/* ── Step 1: User Info ── */}
        {step === 1 && (
          <div className="onboarding-card animate-fade-up">
            <div className="card-header">
              <Target size={22} />
              <h2>Tell us about yourself</h2>
            </div>
            <p className="card-desc">Set up your learning profile for a personalized experience</p>

            <div className="form-grid">
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Your Name</label>
                <input
                  id="input-name"
                  className="form-input"
                  placeholder="e.g. Manvi Khanna"
                  value={formData.name}
                  onChange={(e) => handleUserChange('name', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  <Clock size={14} style={{ display: 'inline', marginRight: '4px' }} />
                  Daily Study Hours
                </label>
                <div className="hours-selector">
                  {[2, 3, 4, 5, 6, 8].map((h) => (
                    <button
                      key={h}
                      id={`btn-hours-${h}`}
                      className={`hours-btn ${formData.daily_hours === h ? 'active' : ''}`}
                      onClick={() => handleUserChange('daily_hours', h)}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  <Zap size={14} style={{ display: 'inline', marginRight: '4px' }} />
                  Peak Study Time
                </label>
                <div className="time-selector">
                  {[
                    { value: 'morning', label: '🌅 Morning', sub: '6-12 AM' },
                    { value: 'afternoon', label: '☀️ Afternoon', sub: '12-6 PM' },
                    { value: 'evening', label: '🌆 Evening', sub: '6-10 PM' },
                    { value: 'night', label: '🌙 Night', sub: '9 PM+' },
                  ].map(({ value, label, sub }) => (
                    <button
                      key={value}
                      id={`btn-peak-${value}`}
                      className={`time-btn ${formData.peak_time === value ? 'active' : ''}`}
                      onClick={() => handleUserChange('peak_time', value)}
                    >
                      <span className="time-label">{label}</span>
                      <span className="time-sub">{sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="card-actions">
              <button
                id="btn-next-step"
                className="btn btn-primary btn-lg"
                onClick={() => {
                  if (!formData.name.trim()) { addToast('Please enter your name', 'error'); return; }
                  setStep(2);
                }}
              >
                Continue <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Subjects ── */}
        {step === 2 && (
          <div className="onboarding-card animate-fade-up">
            <div className="card-header">
              <BookOpen size={22} />
              <h2>Add Your Subjects</h2>
            </div>
            <p className="card-desc">You'll answer a quick diagnostic quiz per subject next</p>

            <div className="subjects-list">
              {subjects.map((subj, si) => (
                <div key={si} className="subject-card" id={`subject-card-${si}`}>
                  <div className="subject-header">
                    <span className="subject-num">Subject {si + 1}</span>
                    {subjects.length > 1 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeSubjectRow(si)}
                        id={`btn-remove-subject-${si}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="form-grid subject-form">
                    <div className="form-group">
                      <label className="form-label">Subject Name *</label>
                      <input
                        id={`input-subject-name-${si}`}
                        className="form-input"
                        placeholder="e.g. Mathematics"
                        value={subj.name}
                        onChange={(e) => updateSubject(si, 'name', e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Exam Date</label>
                      <input
                        id={`input-exam-date-${si}`}
                        type="date"
                        className="form-input"
                        value={subj.exam_date}
                        onChange={(e) => updateSubject(si, 'exam_date', e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>

                    <div className="form-group" style={{ gridColumn: '1/-1' }}>
                      <label className="form-label">
                        Difficulty Level: <span style={{ color: 'var(--accent-orange)' }}>
                          {DIFFICULTY_LABELS[subj.difficulty]}
                        </span>
                      </label>
                      <div className="diff-btns">
                        {[1, 2, 3, 4, 5].map((d) => (
                          <button
                            key={d}
                            className={`diff-btn ${subj.difficulty === d ? 'active' : ''}`}
                            onClick={() => updateSubject(si, 'difficulty', d)}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Topics */}
                    <div className="form-group" style={{ gridColumn: '1/-1' }}>
                      <label className="form-label">Topics (optional)</label>
                      <div className="topics-list">
                        {subj.topics.map((t, ti) => (
                          <div key={ti} className="topic-row">
                            <input
                              id={`input-topic-${si}-${ti}`}
                              className="form-input"
                              placeholder={`Topic ${ti + 1}`}
                              value={t.name}
                              onChange={(e) => updateTopic(si, ti, e.target.value)}
                            />
                            {subj.topics.length > 1 && (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => removeTopic(si, ti)}
                                id={`btn-remove-topic-${si}-${ti}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          className="btn btn-ghost btn-sm add-topic-btn"
                          onClick={() => addTopic(si)}
                          id={`btn-add-topic-${si}`}
                        >
                          <Plus size={14} /> Add Topic
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              id="btn-add-subject"
              className="btn btn-secondary"
              onClick={addSubjectRow}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <Plus size={16} /> Add Another Subject
            </button>

            <div className="card-actions" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)} id="btn-back">
                ← Back
              </button>
              <button
                id="btn-go-quiz"
                className="btn btn-primary btn-lg"
                onClick={goToQuiz}
              >
                Diagnostic Quiz <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Diagnostic Quiz ── */}
        {step === 3 && (
          <div className="onboarding-card">
            <div className="card-header">
              <Brain size={22} />
              <h2>Quick Diagnostic</h2>
            </div>
            <p className="card-desc">
              Subject {quizIdx + 1} of {subjects.length}
            </p>
            <DiagnosticQuiz
              key={quizIdx}
              subjectName={subjects[quizIdx]?.name}
              onComplete={handleQuizComplete}
            />
          </div>
        )}

        {/* ── Step 4: Results ── */}
        {step === 4 && (
          <div className="onboarding-card">
            <ResultsScreen
              subjects={subjects.map((s, i) => ({ name: s.name, proficiency: quizResults[i] ?? 3 }))}
              onFinish={handleSubmit}
            />
            {loading && (
              <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)' }}>
                Generating your personalized plan…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
