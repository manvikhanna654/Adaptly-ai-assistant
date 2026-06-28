import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getSubjects, addSubject, updateSubject, deleteSubject, generateSchedule } from '../api/client';
import { Plus, Trash2, Edit3, Check, X, BookOpen, Calendar, Target, Flame } from 'lucide-react';
import './Subjects.css';

const PROFICIENCY_LABELS = ['', 'Beginner', 'Basic', 'Intermediate', 'Advanced', 'Expert'];
const DIFFICULTY_LABELS = ['', 'Very Easy', 'Easy', 'Moderate', 'Hard', 'Very Hard'];

const PRIORITY_COLOR = (score) => {
  if (score >= 8) return '#ef4444';
  if (score >= 6) return '#f59e0b';
  if (score >= 4) return '#06b6d4';
  return '#10b981';
};

const PROF_COLORS = ['', '#ef4444', '#f59e0b', '#06b6d4', '#10b981', '#7c3aed'];

export default function Subjects() {
  const { userId, addToast } = useApp();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [newSubj, setNewSubj] = useState({
    name: '', proficiency: 3, difficulty: 3, exam_date: '', topics: [{ name: '' }]
  });

  useEffect(() => {
    if (!userId) { navigate('/'); return; }
    loadSubjects();
  }, [userId]);

  const loadSubjects = async () => {
    setLoading(true);
    try {
      const res = await getSubjects(userId);
      setSubjects(res.data);
    } catch { addToast('Failed to load subjects', 'error'); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!newSubj.name.trim()) { addToast('Subject name is required', 'error'); return; }
    try {
      await addSubject({
        user_id: userId,
        ...newSubj,
        topics: newSubj.topics.filter(t => t.name.trim())
      });
      await generateSchedule(userId, 7);
      setNewSubj({ name: '', proficiency: 3, difficulty: 3, exam_date: '', topics: [{ name: '' }] });
      setShowAdd(false);
      await loadSubjects();
      addToast('Subject added and schedule updated!', 'success');
    } catch { addToast('Failed to add subject', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this subject and all its tasks?')) return;
    try {
      await deleteSubject(id);
      await loadSubjects();
      addToast('Subject deleted', 'success');
    } catch { addToast('Failed to delete subject', 'error'); }
  };

  const startEdit = (subj) => {
    setEditId(subj.id);
    setEditData({
      name: subj.name,
      proficiency: subj.proficiency,
      difficulty: subj.difficulty,
      exam_date: subj.exam_date || '',
    });
  };

  const saveEdit = async (id) => {
    try {
      await updateSubject(id, editData);
      await generateSchedule(userId, 7);
      setEditId(null);
      await loadSubjects();
      addToast('Subject updated!', 'success');
    } catch { addToast('Failed to update subject', 'error'); }
  };

  const ExamBadge = ({ date }) => {
    if (!date) return <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No exam set</span>;
    const days = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
    const color = days <= 7 ? 'var(--accent-red)' : days <= 14 ? 'var(--accent-orange)' : 'var(--accent-cyan)';
    return (
      <span style={{ color, fontSize: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Calendar size={12} />
        {days > 0 ? `${days}d left` : 'Past'}
      </span>
    );
  };

  if (loading) return (
    <div className="page-container"><div className="loading-screen"><div className="spinner" /></div></div>
  );

  return (
    <div className="page-container">
      <div className="page-header subjects-header">
        <div>
          <h1 className="page-title">My Subjects</h1>
          <p className="page-subtitle">Manage your subjects, proficiency, and exam dates</p>
        </div>
        <button id="btn-add-subject" className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add Subject
        </button>
      </div>

      {/* Add Subject Form */}
      {showAdd && (
        <div className="glass-card add-subject-form animate-fade-up">
          <div className="section-header">
            <BookOpen size={18} />
            <h3>New Subject</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)} id="btn-close-add">
              <X size={16} />
            </button>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Subject Name *</label>
              <input id="input-new-subject-name" className="form-input" placeholder="e.g. Chemistry"
                value={newSubj.name} onChange={e => setNewSubj(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Exam Date</label>
              <input id="input-new-exam-date" type="date" className="form-input"
                value={newSubj.exam_date} min={new Date().toISOString().split('T')[0]}
                onChange={e => setNewSubj(p => ({ ...p, exam_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Proficiency: {PROFICIENCY_LABELS[newSubj.proficiency]}</label>
              <input type="range" min="1" max="5" className="form-range"
                value={newSubj.proficiency} onChange={e => setNewSubj(p => ({ ...p, proficiency: Number(e.target.value) }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Difficulty: {DIFFICULTY_LABELS[newSubj.difficulty]}</label>
              <input type="range" min="1" max="5" className="form-range"
                value={newSubj.difficulty} onChange={e => setNewSubj(p => ({ ...p, difficulty: Number(e.target.value) }))} />
            </div>
          </div>

          {/* Topics */}
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Topics</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {newSubj.topics.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input className="form-input" placeholder={`Topic ${i + 1}`} value={t.name}
                    onChange={e => {
                      const tops = [...newSubj.topics];
                      tops[i] = { name: e.target.value };
                      setNewSubj(p => ({ ...p, topics: tops }));
                    }} />
                  {newSubj.topics.length > 1 && (
                    <button className="btn btn-ghost btn-sm" onClick={() =>
                      setNewSubj(p => ({ ...p, topics: p.topics.filter((_, idx) => idx !== i) }))}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
                onClick={() => setNewSubj(p => ({ ...p, topics: [...p.topics, { name: '' }] }))}>
                <Plus size={14} /> Add Topic
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            <button id="btn-save-subject" className="btn btn-primary" onClick={handleAdd}>
              <Check size={16} /> Save Subject
            </button>
          </div>
        </div>
      )}

      {/* Subjects Grid */}
      {subjects.length === 0 ? (
        <div className="empty-state glass-card">
          <div className="empty-icon">📚</div>
          <div className="empty-title">No subjects added yet</div>
          <div className="empty-desc">Add your first subject to get started.</div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add Subject
          </button>
        </div>
      ) : (
        <div className="subjects-grid">
          {subjects.map((subj) => (
            <div key={subj.id} className="glass-card subject-detail-card" id={`subject-${subj.id}`}>
              {editId === subj.id ? (
                /* Edit Mode */
                <div className="edit-form">
                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input className="form-input" value={editData.name}
                      onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Exam Date</label>
                    <input type="date" className="form-input" value={editData.exam_date}
                      onChange={e => setEditData(p => ({ ...p, exam_date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Proficiency: {PROFICIENCY_LABELS[editData.proficiency]}</label>
                    <input type="range" min="1" max="5" className="form-range"
                      value={editData.proficiency}
                      onChange={e => setEditData(p => ({ ...p, proficiency: Number(e.target.value) }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Difficulty: {DIFFICULTY_LABELS[editData.difficulty]}</label>
                    <input type="range" min="1" max="5" className="form-range"
                      value={editData.difficulty}
                      onChange={e => setEditData(p => ({ ...p, difficulty: Number(e.target.value) }))} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
                      <X size={14} /> Cancel
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(subj.id)}>
                      <Check size={14} /> Save
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <>
                  <div className="subj-card-header">
                    <div className="subj-color-bar" style={{
                      background: `linear-gradient(135deg, ${PRIORITY_COLOR(subj.priority_score)}, transparent)`
                    }} />
                    <div className="subj-name-row">
                      <h3 className="subj-card-name">{subj.name}</h3>
                      <div className="priority-chip" style={{ color: PRIORITY_COLOR(subj.priority_score) }}>
                        <Flame size={12} /> {subj.priority_score?.toFixed(1)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(subj)}
                        id={`btn-edit-${subj.id}`}><Edit3 size={14} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(subj.id)}
                        id={`btn-delete-${subj.id}`}><Trash2 size={14} /></button>
                    </div>
                  </div>

                  <div className="subj-card-stats">
                    <div className="subj-stat">
                      <div className="subj-stat-label">Proficiency</div>
                      <div className="subj-stat-value" style={{ color: PROF_COLORS[subj.proficiency] }}>
                        {PROFICIENCY_LABELS[subj.proficiency]}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                          ({subj.proficiency}/5)
                        </span>
                      </div>
                      <div className="progress-bar-container" style={{ marginTop: '0.25rem' }}>
                        <div className="progress-bar-fill" style={{
                          width: `${(subj.proficiency / 5) * 100}%`,
                          background: PROF_COLORS[subj.proficiency]
                        }} />
                      </div>
                    </div>

                    <div className="subj-stat">
                      <div className="subj-stat-label">Difficulty</div>
                      <div className="subj-stat-value" style={{ color: PRIORITY_COLOR(subj.difficulty * 2) }}>
                        {DIFFICULTY_LABELS[subj.difficulty]}
                      </div>
                      <div className="progress-bar-container" style={{ marginTop: '0.25rem' }}>
                        <div className="progress-bar-fill" style={{
                          width: `${(subj.difficulty / 5) * 100}%`,
                          background: PRIORITY_COLOR(subj.difficulty * 2)
                        }} />
                      </div>
                    </div>
                  </div>

                  <div className="subj-card-bottom">
                    <div className="subj-bottom-stat">
                      <Target size={13} />
                      {Math.round((subj.completion_rate || 0) * 100)}% completion
                    </div>
                    <div className="subj-bottom-stat">
                      <BookOpen size={13} />
                      {subj.total_hours_spent?.toFixed(1)}h studied
                    </div>
                    <ExamBadge date={subj.exam_date} />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
