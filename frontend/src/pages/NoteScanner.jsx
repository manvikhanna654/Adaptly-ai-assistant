import React, { useState, useRef } from 'react';
import { UploadCloud, Image as ImageIcon, CheckCircle2, AlertCircle, Loader2, Save, Target, Flame, BookOpen, Star, Zap, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { scanNote, saveSubjectFromScan } from '../api/client';
import './NoteScanner.css';

export default function NoteScanner() {
  const { userId, addToast } = useApp();
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [flippedCards, setFlippedCards] = useState({});

  const toggleFlip = (index) => {
    setFlippedCards(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.type.startsWith('image/') || droppedFile.type === 'application/pdf')) {
      handleFileSelected(droppedFile);
    } else {
      setError("Please drop a valid image or PDF file.");
    }
  };

  const handleFileInput = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      handleFileSelected(selectedFile);
    }
  };

  const handleFileSelected = (selectedFile) => {
    setFile(selectedFile);
    if (selectedFile.type === 'application/pdf') {
      setPreviewUrl('pdf');
    } else {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    }
    setScanResult(null);
    setError(null);
    setIsSaved(false);
  };

  const removeImage = () => {
    setFile(null);
    setPreviewUrl(null);
    setScanResult(null);
    setError(null);
    setIsSaved(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const scanDocument = async () => {
    if (!file) return;
    setIsScanning(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', file);
    formData.append('user_id', userId);

    try {
      const response = await scanNote(formData);
      setScanResult(response.data);
    } catch (err) {
      const message = err?.response?.data?.error || err.message || 'Failed to scan note';
      setError(message);
      addToast(message, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const saveToSubjects = async () => {
    if (!scanResult) return;
    setIsSaving(true);
    try {
      await saveSubjectFromScan({
        user_id: userId,
        subject: scanResult.subject,
        difficulty: scanResult.difficulty,
        topics: scanResult.topics
      });
      setIsSaved(true);
      addToast('Subject and topics saved successfully', 'success');
    } catch (err) {
      addToast(err?.response?.data?.error || err.message || 'Failed to save subject', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-container dashboard-page">
      <div className="dashboard-header non-focus-el" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">AI Note Scanner 📸</h1>
          <p className="page-subtitle">Instantly extract subjects, topics, and flashcards from your study materials.</p>
        </div>
      </div>

      <div className="scanner-layout">
        {/* Left Col: Upload Zone */}
        <div className="scanner-upload-section">
          <div 
            className={`glass-card drag-drop-zone ${isDragging ? 'drag-over' : ''} ${previewUrl ? 'has-preview' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
          >
            {previewUrl === 'pdf' ? (
              <div className="image-preview-container" style={{ flexDirection: 'column', gap: '1rem' }}>
                <FileText size={64} style={{ color: 'var(--accent-red)' }} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{file?.name}</span>
                <div className="image-overlay">
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                      className="btn btn-secondary change-image-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      Change File
                    </button>
                    <button 
                      className="btn btn-danger remove-image-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage();
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : previewUrl ? (
              <div className="image-preview-container">
                <img src={previewUrl} alt="Note Preview" className="image-preview" />
                <div className="image-overlay">
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                      className="btn btn-secondary change-image-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      Change Image
                    </button>
                    <button 
                      className="btn btn-danger remove-image-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage();
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <UploadCloud size={48} className="empty-icon text-muted" />
                <h3 className="empty-title" style={{ marginTop: '1rem' }}>Drag & drop an image or PDF</h3>
                <p className="empty-desc">or click to browse</p>
                <span className="file-hint text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>JPG, PNG, PDF supported</span>
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="image/*,application/pdf"
              onChange={handleFileInput}
            />
          </div>

          {error && (
            <div className="error-alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <button 
            className={`btn btn-primary scan-btn ${!file || isScanning ? 'disabled' : ''}`}
            onClick={scanDocument}
            disabled={!file || isScanning}
            style={{ width: '100%', justifyContent: 'center', padding: '1rem', fontSize: '1rem' }}
          >
            {isScanning ? (
              <>
                <Loader2 size={18} className="spin" />
                Scanning...
              </>
            ) : (
              'Scan'
            )}
            
            {isScanning && (
              <div className="progress-bar-container" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '4px' }}>
                <div className="progress-bar-fill" style={{ width: '30%', animation: 'loading-bar 2s infinite ease-in-out', backgroundColor: 'var(--text-primary)' }}></div>
              </div>
            )}
          </button>
        </div>

        {/* Right Col: Results */}
        <div className="scanner-results-section">
          {!scanResult && !isScanning && (
            <div className="glass-card empty-state" style={{ height: '100%' }}>
              <ImageIcon size={48} className="empty-icon" />
              <p className="empty-desc">Scan an image to generate insights and flashcards</p>
            </div>
          )}

          {isScanning && (
            <div className="glass-card scanning-placeholder">
              <div className="book">
                <div className="book__pg-shadow" />
                <div className="book__pg" />
                <div className="book__pg book__pg--2" />
                <div className="book__pg book__pg--3" />
                <div className="book__pg book__pg--4" />
                <div className="book__pg book__pg--5" />
              </div>
              <p>✨ AI is reading your notes...</p>
            </div>
          )}

          {scanResult && !isScanning && (
            <div className="scan-results-content">
              {/* Stats Row */}
              <div className="grid-3 stats-row" style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="glass-card stat-widget" style={{ '--accent': 'var(--accent-purple)' }}>
                  <div className="stat-icon"><Target size={20} /></div>
                  <div className="stat-value" style={{ color: 'var(--accent-purple-light)', fontSize: '1.5rem' }}>
                    {scanResult.subject}
                  </div>
                  <div className="stat-label">Detected Subject</div>
                </div>

                <div className="glass-card stat-widget" style={{ '--accent': 'var(--accent-orange)' }}>
                  <div className="stat-icon"><Flame size={20} /></div>
                  <div className="stat-value" style={{ color: 'var(--accent-orange)' }}>
                    Level {scanResult.difficulty}
                  </div>
                  <div className="stat-label">Difficulty Rating</div>
                </div>

                <div className="glass-card stat-widget" style={{ '--accent': 'var(--accent-cyan)' }}>
                  <div className="stat-icon"><BookOpen size={20} /></div>
                  <div className="stat-value" style={{ color: 'var(--accent-cyan-light)' }}>
                    {scanResult.flashcards?.length || 0}
                  </div>
                  <div className="stat-label">Flashcards Extracted</div>
                </div>
              </div>

              {/* Summary and Topics Section */}
              <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                <div className="section-header" style={{ marginBottom: '1rem' }}>
                  <Star size={18} />
                  <h3 style={{ margin: 0 }}>AI Summary & Topics</h3>
                </div>
                <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                  {scanResult.summary}
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {scanResult.topics.map((topic, i) => (
                    <span key={i} className="badge badge-cyan" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                      <Zap size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      {topic}
                    </span>
                  ))}
                </div>
              </div>

              {/* Flashcards Section */}
              <div className="glass-card">
                <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <BookOpen size={18} />
                    <h3 style={{ margin: 0 }}>Flashcards Deck</h3>
                  </div>
                  <button 
                    className={`btn ${isSaved ? 'btn-secondary' : 'btn-primary'}`} 
                    onClick={saveToSubjects}
                    disabled={isSaving || isSaved}
                  >
                    {isSaving ? <Loader2 size={16} className="spin" /> : (isSaved ? <CheckCircle2 size={16} /> : <Save size={16} />)}
                    {isSaved ? 'Saved to Subjects' : 'Save Extracted Data'}
                  </button>
                </div>

                <div className="flashcards-grid" style={{ marginTop: '1.5rem' }}>
                  {scanResult.flashcards?.map((card, i) => (
                    <div
                      key={i}
                      className={`fc-card ${flippedCards[i] ? 'flipped' : ''}`}
                      onClick={() => toggleFlip(i)}
                    >
                      <div className="fc-card__border" />
                      <div className="fc-card-inner">
                        {/* FRONT: Question */}
                        <div className="fc-card-front">
                          <div className="fc-badge-row">
                            <span className="fc-badge">Q</span>
                            <span className="fc-hint">tap to reveal ✨</span>
                          </div>
                          <div className="fc-body">
                            <span className="fc-icon">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor">
                                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                              </svg>
                            </span>
                            <p className="fc-question">{card.question}</p>
                          </div>
                          <div className="fc-number">#{i + 1}</div>
                        </div>
                        {/* BACK: Answer */}
                        <div className="fc-card-back">
                          <div className="fc-badge-row">
                            <span className="fc-badge fc-badge-answer">A</span>
                            <span className="fc-hint">tap to go back 🔄</span>
                          </div>
                          <div className="fc-body">
                            <p className="fc-answer">{card.answer}</p>
                          </div>
                          <div className="fc-number">#{i + 1}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
