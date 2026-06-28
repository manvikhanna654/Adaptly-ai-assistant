import React, { useEffect, useRef, useState } from 'react';
import { Send, User, LoaderCircle, Bot, Sparkles, ChevronRight } from 'lucide-react';
import Spline from '@splinetool/react-spline';
import { useApp } from '../context/AppContext';
import { chatWithCoach } from '../api/client';
import './Coach.css';

const STARTERS = [
  'What should I focus on today?',
  'Which subject is my weakest?',
  'Give me a 2-hour revision plan.',
  'Why are these tasks high priority?',
];

function makeWelcomeMessage(name) {
  return {
    role: 'assistant',
    content: `Hi${name ? ` ${name.split(' ')[0]}` : ''}! I'm Aiva, your personalised AI study assistant 🌸 I can help with your schedule, weak subjects, exam prep, missed tasks, and study strategy. What's on your mind?`,
  };
}

export default function Coach() {
  const { userId, user, addToast } = useApp();
  const storageKey = `studyai_chat_${userId}`;
  const [messages, setMessages] = useState(() => [makeWelcomeMessage('')]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    const raw = localStorage.getItem(storageKey);
    if (!raw) { setMessages([makeWelcomeMessage(user?.name)]); return; }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setMessages(parsed);
        if (parsed.length > 1) setShowChat(true);
        return;
      }
    } catch { /* ignore */ }
    setMessages([makeWelcomeMessage(user?.name)]);
  }, [storageKey, user?.name, userId]);

  useEffect(() => {
    if (!userId || messages.length === 0) return;
    localStorage.setItem(storageKey, JSON.stringify(messages.slice(-20)));
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, storageKey, userId]);

  const sendMessage = async (draft) => {
    const content = (draft ?? input).trim();
    if (!content || sending) return;
    setShowChat(true);
    const nextMsg = { role: 'user', content };
    setMessages(prev => [...prev, nextMsg]);
    setInput('');
    setSending(true);
    try {
      const response = await chatWithCoach(userId, {
        message: content,
        history: messages.slice(-8),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: response.data.answer }]);
    } catch (error) {
      const msg = error?.response?.data?.error || 'Coach is unavailable right now.';
      setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
      addToast(msg, 'error');
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    const reset = [makeWelcomeMessage(user?.name)];
    setMessages(reset);
    setShowChat(false);
    localStorage.removeItem(storageKey);
  };

  return (
    <div className="coach-page">
      <div className="coach-center-card">

        {/* ── AIVA INTRO ── */}
        <div className="coach-aiva-intro">
          <span className="coach-aiva-badge">✨ Meet Aiva</span>
          <p className="coach-aiva-tagline">
            Hi! I&apos;m <strong>Aiva</strong>, your personalised AI study assistant 🌸
          </p>
        </div>

        {/* ── TOP GREETING ── */}
        <p className="coach-greeting">
          Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
        </p>
        <h1 className="coach-heading">How Can I Help You Today?</h1>

        {/* ── ROBOT HERO ── */}
        <div className="coach-robot-wrap">
          <div className="coach-spline-container">
            <Spline scene="https://prod.spline.design/B02fX7mZY4HK-eVE/scene.splinecode?v=2" />
          </div>
        </div>

        {/* ── STARTER PILLS ── */}
        {!showChat && (
          <div className="coach-pills">
            {STARTERS.map(s => (
              <button key={s} className="coach-pill" onClick={() => sendMessage(s)} disabled={sending}>
                <ChevronRight size={14} />
                {s}
              </button>
            ))}
          </div>
        )}

        {/* ── CHAT THREAD ── */}
        {showChat && (
          <div className="coach-thread">
            {messages.map((msg, i) => (
              <div key={i} className={`coach-msg ${msg.role === 'user' ? 'user' : 'bot'}`}>
                <div className="coach-msg-avatar">
                  {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className="coach-msg-bubble">
                  <span className="coach-msg-role">{msg.role === 'user' ? 'You' : 'Coach'}</span>
                  <p className="coach-msg-text">{msg.content}</p>
                </div>
              </div>
            ))}
            {sending && (
              <div className="coach-msg bot">
                <div className="coach-msg-avatar"><Bot size={14} /></div>
                <div className="coach-msg-bubble">
                  <span className="coach-msg-role">Coach</span>
                  <p className="coach-msg-text coach-typing">
                    <LoaderCircle size={14} className="spin" /> Thinking...
                  </p>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* ── INPUT BAR ── */}
        <form
          className="coach-input-bar"
          onSubmit={e => { e.preventDefault(); sendMessage(); }}
        >
          <input
            className="coach-text-input"
            type="text"
            placeholder="Ask me anything about your study plan..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={sending}
          />
          <button className="coach-send-btn" type="submit" disabled={sending || !input.trim()}>
            <Send size={16} />
          </button>
        </form>

        {/* ── FOOTER ACTIONS ── */}
        <div className="coach-footer">
          <span className="coach-hint">
            <Sparkles size={12} /> I can help with schedule · weak subjects · exam prep · study strategy
          </span>
          {showChat && (
            <button className="coach-clear-btn" onClick={clearChat}>Clear chat</button>
          )}
        </div>

      </div>
    </div>
  );
}
