import React, { useState, useEffect, useRef } from 'react';
import {
  BrainCircuit, Sparkles, FileText, BookOpen, Type, UploadCloud,
  ChevronLeft, ChevronRight, CheckCircle2, XCircle, Loader2,
  RotateCcw, Save, Flag, Star, BarChart2, AlertTriangle, Zap, Eye
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { generateQuiz, generateQuizFromUpload, saveQuiz, getSubjects } from '../api/client';
// Note: getSubjects(userId) is exported from client.js
import './QuizGenerator.css';

const SOURCE_OPTIONS = [
  { id: 'subject', label: 'My Subject', icon: '📚' },
  { id: 'text',    label: 'Paste Text', icon: '✏️' },
  { id: 'pdf',     label: 'Upload PDF', icon: '📄' },
];

const QUIZ_TYPES = [
  { id: 'mcq',          label: 'MCQ' },
  { id: 'true_false',   label: 'True / False' },
  { id: 'short_answer', label: 'Short Answer' },
  { id: 'flashcard',    label: 'Flashcards' },
  { id: 'mixed',        label: 'Mixed Mode' },
];

const DIFFICULTIES = ['easy', 'medium', 'hard', 'adaptive'];

// ── Helpers ──────────────────────────────────────────────────────
function Toggle({ on, onToggle }) {
  return (
    <button
      className={`toggle-switch ${on ? 'on' : ''}`}
      onClick={onToggle}
      type="button"
      aria-pressed={on}
    />
  );
}

function OptionLetter({ letter, state }) {
  return <span className={`option-letter ${state}`}>{letter}</span>;
}

// ── Main Component ───────────────────────────────────────────────
export default function QuizGenerator() {
  const { userId, addToast } = useApp();

  // Config
  const [source, setSource]         = useState('subject');
  const [subjects, setSubjects]     = useState([]);
  const [subjectId, setSubjectId]   = useState('');
  const [pastedText, setPastedText] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const fileRef                     = useRef(null);

  const [quizType,   setQuizType]   = useState('mcq');
  const [difficulty, setDifficulty] = useState('medium');
  const [numQ,       setNumQ]       = useState(10);
  const [weakOn,     setWeakOn]     = useState(false);
  const [examOn,     setExamOn]     = useState(false);
  const [explOn,     setExplOn]     = useState(true);

  // Quiz state
  const [loading,    setLoading]    = useState(false);
  const [quiz,       setQuiz]       = useState(null);   // { title, source_summary, questions }
  const [current,   setCurrent]     = useState(0);
  const [answers,   setAnswers]     = useState({});     // { qIdx: selectedAnswer }
  const [revealed,  setRevealed]    = useState({});     // { qIdx: true }
  const [flipped,   setFlipped]     = useState({});     // flashcard flip
  const [marked,    setMarked]      = useState({});     // marked as hard
  const [done,      setDone]        = useState(false);
  const [saving,    setSaving]      = useState(false);

  // Load subjects
  useEffect(() => {
    if (!userId) return;
    getSubjects(userId)
      .then(r => { setSubjects(r.data || []); if (r.data?.length) setSubjectId(r.data[0].id); })
      .catch(() => {});
  }, [userId]);

  // ── Generate ─────────────────────────────────────────────────
  const handleGenerate = async () => {
    setLoading(true);
    setQuiz(null);
    setAnswers({});
    setRevealed({});
    setFlipped({});
    setMarked({});
    setDone(false);
    setCurrent(0);
    try {
      let res;
      if (source === 'pdf' && uploadFile) {
        const fd = new FormData();
        fd.append('file', uploadFile);
        fd.append('quiz_type', quizType);
        fd.append('difficulty', difficulty);
        fd.append('num_questions', numQ);
        fd.append('include_explanations', explOn);
        fd.append('exam_focused', examOn);
        res = await generateQuizFromUpload(fd);
      } else {
        const body = {
          source_type: source,
          quiz_type:   quizType,
          difficulty,
          num_questions: numQ,
          prioritize_weak: weakOn,
          exam_focused:   examOn,
          include_explanations: explOn,
        };
        if (source === 'subject') body.subject_id = Number(subjectId);
        if (source === 'text')    body.content    = pastedText;
        res = await generateQuiz(body);
      }
      setQuiz(res.data);
      addToast('Quiz generated! Good luck 🎯', 'success');
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Failed to generate quiz';
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Answer logic ─────────────────────────────────────────────
  const q = quiz?.questions?.[current];

  const selectOption = (opt) => {
    if (revealed[current]) return;
    setAnswers(p => ({ ...p, [current]: opt }));
  };

  const checkAnswer = () => {
    if (!answers[current] && q?.type !== 'short_answer') return;
    setRevealed(p => ({ ...p, [current]: true }));
  };

  const nextQ = () => {
    if (current < quiz.questions.length - 1) setCurrent(c => c + 1);
    else setDone(true);
  };

  const prevQ = () => { if (current > 0) setCurrent(c => c - 1); };

  const toggleMark = () => setMarked(p => ({ ...p, [current]: !p[current] }));

  // ── Results ───────────────────────────────────────────────────
  const calcResults = () => {
    if (!quiz) return { correct: 0, total: 0, pct: 0, weakTopics: [] };
    let correct = 0;
    const weak = [];
    quiz.questions.forEach((q, i) => {
      if (q.type === 'short_answer' || q.type === 'flashcard') { correct++; return; }
      const userAns = (answers[i] || '').toString().trim().toLowerCase();
      const corrAns = (q.correct_answer || '').toString().trim().toLowerCase();
      if (userAns === corrAns || userAns.startsWith(corrAns[0])) correct++;
      else if (q.topic) weak.push(q.topic);
    });
    const total  = quiz.questions.length;
    const pct    = total ? Math.round((correct / total) * 100) : 0;
    const weakTopics = [...new Set(weak)];
    return { correct, total, pct, weakTopics };
  };

  const handleSave = async () => {
    if (!quiz) return;
    const { correct, total, pct, weakTopics } = calcResults();
    setSaving(true);
    try {
      await saveQuiz({
        title:        quiz.title,
        source_type:  source,
        quiz_type:    quizType,
        questions:    quiz.questions,
        score:        pct,
        total_questions: total,
        weak_topics:  weakTopics,
      });
      addToast('Quiz saved to history ✅', 'success');
    } catch {
      addToast('Could not save quiz', 'error');
    } finally {
      setSaving(false);
    }
  };

  const restart = () => {
    setDone(false);
    setCurrent(0);
    setAnswers({});
    setRevealed({});
    setFlipped({});
  };

  // ── Option state helper ───────────────────────────────────────
  const optionState = (opt, idx) => {
    if (!revealed[current]) return answers[current] === opt ? 'selected' : '';
    const corrAns = q.correct_answer || '';
    const isCorrect =
      opt === corrAns ||
      opt.charAt(0).toUpperCase() === corrAns.toUpperCase() ||
      opt.toLowerCase().includes(corrAns.toLowerCase());
    if (isCorrect) return 'correct';
    if (answers[current] === opt) return 'incorrect';
    return '';
  };

  // ── Render ───────────────────────────────────────────────────
  const canGenerate = (source === 'subject' && subjectId) ||
    (source === 'text' && pastedText.trim().length > 20) ||
    (source === 'pdf' && uploadFile);

  return (
    <div className="page-container quiz-page">

      {/* Hero */}
      <div className="quiz-hero">
        <div className="quiz-hero-left">
          <h1 className="quiz-hero-title">Memory-Based Quiz Generator</h1>
          <p className="quiz-hero-sub">Turn your notes into quizzes, flashcards &amp; practice tests — instantly.</p>
          <div className="quiz-hero-badges">
            <span className="quiz-hero-badge"><Sparkles size={11}/> AI-Powered Revision</span>
            <span className="quiz-hero-badge"><Zap size={11}/> Adaptive Difficulty</span>
            <span className="quiz-hero-badge"><Star size={11}/> Smart Weak-Topic Focus</span>
          </div>
        </div>
        <div className="quiz-hero-icon">🧠</div>
      </div>

      {/* Source Selector */}
      <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
        <p className="config-section-title">Choose your source</p>
        <div className="source-grid">
          {SOURCE_OPTIONS.map(s => (
            <div
              key={s.id}
              className={`source-card ${source === s.id ? 'active' : ''}`}
              onClick={() => setSource(s.id)}
            >
              <span className="source-card-icon">{s.icon}</span>
              <span className="source-card-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Dynamic input area */}
        {source === 'subject' && (
          subjects.length ? (
            <select className="form-select" value={subjectId} onChange={e => setSubjectId(e.target.value)}>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <div className="empty-state" style={{ padding: '1rem' }}>
              <p className="empty-desc">No subjects yet — add them in the Subjects section first.</p>
            </div>
          )
        )}

        {source === 'text' && (
          <textarea
            className="form-textarea"
            rows={5}
            placeholder="Paste your notes, textbook excerpts, or any study material here…"
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
          />
        )}

        {source === 'pdf' && (
          <div style={{ textAlign: 'center' }}>
            <div className="upload-btn-wrap">
              <button className="upload-button" onClick={() => fileRef.current?.click()} type="button">
                <div className="docs">
                  <UploadCloud size={18} />
                  <span>Upload PDF</span>
                </div>
                <div className="upload-indicator">
                  <UploadCloud size={14} />
                  <span>Browse file</span>
                </div>
              </button>
            </div>

            {uploadFile && (
              <div className="upload-file-selected">
                <FileText size={22} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
                <span className="upload-file-name">{uploadFile.name}</span>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setUploadFile(null)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              style={{ display: 'none' }}
              onChange={e => setUploadFile(e.target.files[0] || null)}
            />
          </div>
        )}
      </div>

      {/* Main layout */}
      <div className="quiz-layout">

        {/* ── Config Panel ── */}
        <div className="quiz-config-panel">
          <div className="glass-card">
            <p className="config-section-title">Quiz Type</p>
            <div className="quiz-type-grid">
              {QUIZ_TYPES.map(t => (
                <button key={t.id} className={`quiz-type-pill ${quizType === t.id ? 'active' : ''}`}
                  onClick={() => setQuizType(t.id)}>{t.label}</button>
              ))}
            </div>
          </div>

          <div className="glass-card">
            <p className="config-section-title">Difficulty</p>
            <div className="difficulty-row">
              {DIFFICULTIES.map(d => (
                <button key={d} className={`diff-pill ${d} ${difficulty === d ? 'active' : ''}`}
                  onClick={() => setDifficulty(d)}>{d.charAt(0).toUpperCase() + d.slice(1)}</button>
              ))}
            </div>
          </div>

          <div className="glass-card">
            <p className="config-section-title">Number of Questions</p>
            <div className="q-count-row">
              <input type="range" min={3} max={20} value={numQ} onChange={e => setNumQ(+e.target.value)} />
              <span className="q-count-val">{numQ}</span>
            </div>
          </div>

          <div className="glass-card">
            <p className="config-section-title">Options</p>
            <div className="toggle-row">
              <span className="toggle-label">🎯 Prioritize Weak Topics</span>
              <Toggle on={weakOn} onToggle={() => setWeakOn(p => !p)} />
            </div>
            <div className="toggle-row">
              <span className="toggle-label">📝 Exam-Focused Questions</span>
              <Toggle on={examOn} onToggle={() => setExamOn(p => !p)} />
            </div>
            <div className="toggle-row">
              <span className="toggle-label">💡 Include Explanations</span>
              <Toggle on={explOn} onToggle={() => setExplOn(p => !p)} />
            </div>
          </div>

          <button className="generate-btn" onClick={handleGenerate} disabled={loading || !canGenerate}>
            {loading ? <><Loader2 size={18} className="spin" /> Generating…</> : <><BrainCircuit size={18} /> Generate Quiz</>}
          </button>

          {quiz && !done && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="regen-btn" onClick={handleGenerate} disabled={loading}>
                <RotateCcw size={15} />
                <span className="regen-label">Regenerate</span>
              </button>
              <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Save
              </button>
            </div>
          )}
        </div>

        {/* ── Output Panel ── */}
        <div className="quiz-output-panel">

          {/* Empty */}
          {!quiz && !loading && (
            <div className="glass-card quiz-empty">
              <div className="quiz-empty-icon">🎯</div>
              <h3 className="empty-title">Ready to test your knowledge?</h3>
              <p className="empty-desc">Configure your quiz on the left and hit Generate Quiz to start.</p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="glass-card quiz-loading">
              <div className="quiz-loading-dots">
                <span/><span/><span/>
              </div>
              <h3 style={{ color: 'var(--accent-purple)', fontFamily: 'var(--font-display)' }}>AI is crafting your quiz…</h3>
              <p className="empty-desc">Analysing content, building questions ✨</p>
            </div>
          )}

          {/* Results screen */}
          {quiz && done && (() => {
            const { correct, total, pct, weakTopics } = calcResults();
            const emoji = pct >= 80 ? '🏆' : pct >= 60 ? '👍' : '📖';
            return (
              <div className="glass-card animate-fade-up">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                  <div className="results-score-ring" style={{ '--pct': pct }}>
                    <div className="results-score-inner">
                      <div className="results-score-pct">{pct}%</div>
                      <div className="results-score-lbl">Score</div>
                    </div>
                  </div>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '0.25rem' }}>
                      {emoji} {pct >= 80 ? 'Excellent work!' : pct >= 60 ? 'Good job!' : 'Keep practising!'}
                    </h2>
                    <p className="empty-desc" style={{ marginBottom: '1rem' }}>{quiz.title}</p>
                    <div className="results-stats">
                      <div className="result-stat-pill"><span className="dot" style={{ background: 'var(--accent-green)' }}/>{correct} Correct</div>
                      <div className="result-stat-pill"><span className="dot" style={{ background: 'var(--accent-red)' }}/>{total - correct} Wrong</div>
                      <div className="result-stat-pill"><span className="dot" style={{ background: 'var(--accent-orange)' }}/>{Object.keys(marked).length} Marked Hard</div>
                    </div>
                  </div>
                </div>

                {weakTopics.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <p className="config-section-title" style={{ marginBottom: '0.5rem' }}>
                      <AlertTriangle size={13} style={{ display: 'inline', marginRight: 4 }} />Weak Areas Detected
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {weakTopics.map((t, i) => <span key={i} className="weak-topic-chip">⚠️ {t}</span>)}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={restart}><RotateCcw size={15}/> Practice Again</button>
                  <button className="btn btn-secondary" onClick={handleGenerate}><BrainCircuit size={15}/> New Quiz</button>
                  <button className="btn btn-secondary" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 size={15} className="spin"/> : <Save size={15}/>} Save Result
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Active quiz */}
          {quiz && !done && q && (
            <>
              {/* Progress */}
              <div className="glass-card" style={{ padding: '1rem 1.5rem' }}>
                <div className="quiz-progress-bar">
                  <div className="quiz-progress-fill" style={{ width: `${((current + 1) / quiz.questions.length) * 100}%` }} />
                </div>
                <div className="quiz-progress-label">Question {current + 1} of {quiz.questions.length}</div>
              </div>

              {/* Question Card */}
              <div className="question-card">
                <div className="question-meta">
                  <span className="q-num-badge">Q{current + 1}</span>
                  {q.topic && <span className="q-topic-badge">{q.topic}</span>}
                  {q.difficulty && <span className={`q-diff-badge ${q.difficulty}`}>{q.difficulty}</span>}
                  {marked[current] && <span className="weak-topic-chip" style={{ fontSize: '0.68rem' }}>🚩 Marked</span>}
                </div>

                <p className="question-text">{q.question}</p>

                {/* Flashcard */}
                {q.type === 'flashcard' && (
                  <div className="flashcard-wrapper" onClick={() => setFlipped(p => ({ ...p, [current]: !p[current] }))}>
                    <div className={`flashcard-inner ${flipped[current] ? 'flipped' : ''}`}>
                      <div className="flashcard-face flashcard-front">
                        <p className="flashcard-hint">TAP TO REVEAL ANSWER ✨</p>
                        <p className="flashcard-text">{q.question}</p>
                      </div>
                      <div className="flashcard-face flashcard-back">
                        <p className="flashcard-hint">TAP TO GO BACK 🔄</p>
                        <p className="flashcard-text">{q.correct_answer}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* MCQ / True-False */}
                {(q.type === 'mcq' || q.type === 'true_false') && q.options?.length > 0 && (
                  <div className="options-list">
                    {q.options.map((opt, i) => {
                      const letters = ['A','B','C','D'];
                      const state = optionState(opt, i);
                      return (
                        <button
                          key={i}
                          className={`option-btn ${state}`}
                          onClick={() => selectOption(opt)}
                          disabled={!!revealed[current]}
                        >
                          <span className="option-letter">{q.type === 'true_false' ? (i === 0 ? 'T' : 'F') : letters[i]}</span>
                          {opt}
                          {revealed[current] && state === 'correct' && <CheckCircle2 size={16} style={{ marginLeft: 'auto', color: 'var(--accent-green)' }}/>}
                          {revealed[current] && state === 'incorrect' && <XCircle size={16} style={{ marginLeft: 'auto', color: 'var(--accent-red)' }}/>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Short Answer */}
                {q.type === 'short_answer' && (
                  <textarea
                    className="short-answer-input"
                    placeholder="Type your answer here…"
                    value={answers[current] || ''}
                    onChange={e => setAnswers(p => ({ ...p, [current]: e.target.value }))}
                    disabled={!!revealed[current]}
                  />
                )}

                {/* Explanation */}
                {revealed[current] && q.explanation && (
                  <div className="explanation-box">
                    <strong>💡 Explanation</strong>
                    {q.explanation}
                    {q.type === 'short_answer' && (
                      <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.6)', borderRadius: 'var(--radius-sm)' }}>
                        <strong style={{ color: '#2e7d32', fontSize: '0.8rem' }}>✅ Model Answer:</strong>
                        <p style={{ marginTop: '0.25rem' }}>{q.correct_answer}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Action row */}
                <div className="question-actions">
                  {q.type !== 'flashcard' && (
                    <button className="check-btn" onClick={checkAnswer}
                      disabled={!!revealed[current] || (!answers[current] && q.type !== 'short_answer')}>
                      <Eye size={15}/> Check Answer
                    </button>
                  )}
                  <button className={`mark-hard-btn ${marked[current] ? 'marked' : ''}`} onClick={toggleMark}>
                    <Flag size={14}/> {marked[current] ? 'Marked Hard' : 'Mark as Hard'}
                  </button>
                </div>
              </div>

              {/* Navigation */}
              <div className="quiz-nav-row">
                <button className="btn btn-secondary" onClick={prevQ} disabled={current === 0}>
                  <ChevronLeft size={16}/> Previous
                </button>
                <button className="btn btn-primary" onClick={nextQ}>
                  {current === quiz.questions.length - 1 ? <><BarChart2 size={16}/> See Results</> : <>Next <ChevronRight size={16}/></>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
