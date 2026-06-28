import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, X } from 'lucide-react';
import './PomodoroTimer.css';

const STORAGE_KEY = 'pomodoro_state_v2';

function drawRing(canvas, percent, fg, bg, lineWidth = 6) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const radius = cx - lineWidth - 4;

  ctx.clearRect(0, 0, size, size);

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = bg;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Foreground arc (progress)
  const startAngle = -Math.PI / 2; // top
  const endAngle = startAngle + percent * Math.PI * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = fg;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function getAdaptiveLength(avgQuality) {
  if (avgQuality === null || avgQuality === undefined) return 25;
  if (avgQuality > 0.75) return 35;
  if (avgQuality < 0.45) return 20;
  return 25;
}

export default function PomodoroTimer({
  task = null,
  avgQualityScore = null,
  onSessionDone = null,
  onClose = null,
}) {
  const sessionMinutes = getAdaptiveLength(avgQualityScore);
  const totalSecs = sessionMinutes * 60;

  const [state, setState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.taskId === task?.id) {
        return saved;
      }
    } catch (_) {}
    return { phase: 'idle', remaining: totalSecs, taskId: task?.id || null };
  });

  const intervalRef = useRef(null);
  const canvasRef = useRef(null);

  const percent = state.phase === 'idle' ? 0 : 1 - state.remaining / totalSecs;
  const clampedPercent = Math.min(1, Math.max(0, percent));

  // Persist state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, taskId: task?.id || null }));
  }, [state, task]);

  // Draw ring
  useEffect(() => {
    if (canvasRef.current) {
      drawRing(canvasRef.current, clampedPercent, '#8b7cf8', '#1a1a2e', 10);
    }
  }, [clampedPercent]);

  // Tick
  useEffect(() => {
    if (state.phase === 'running') {
      intervalRef.current = setInterval(() => {
        setState((prev) => {
          if (prev.remaining <= 1) {
            clearInterval(intervalRef.current);
            return { ...prev, phase: 'done', remaining: 0 };
          }
          return { ...prev, remaining: prev.remaining - 1 };
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [state.phase]);

  // Auto-trigger feedback on done
  useEffect(() => {
    if (state.phase === 'done' && onSessionDone) {
      onSessionDone(task);
    }
  }, [state.phase]);

  const start = () => setState((p) => ({ ...p, phase: 'running', remaining: p.remaining === 0 ? totalSecs : p.remaining }));
  const pause = () => setState((p) => ({ ...p, phase: 'paused' }));
  const reset = () => setState({ phase: 'idle', remaining: totalSecs, taskId: task?.id || null });

  const mins = Math.floor(state.remaining / 60).toString().padStart(2, '0');
  const secs = (state.remaining % 60).toString().padStart(2, '0');

  const phaseLabel = {
    idle: 'Ready',
    running: 'Focus',
    paused: 'Paused',
    done: 'Done! 🎉',
  }[state.phase];

  return (
    <div className="pomodoro-timer" id="pomodoro-timer">
      {onClose && (
        <button className="pomodoro-close" onClick={onClose} id="btn-pomodoro-close">
          <X size={16} />
        </button>
      )}

      <div className="pomodoro-ring-wrap">
        <canvas ref={canvasRef} width={180} height={180} className="pomodoro-canvas" />
        <div className="pomodoro-time-overlay">
          <span className="pomodoro-time">{mins}:{secs}</span>
          <span className="pomodoro-phase">{phaseLabel}</span>
        </div>
      </div>

      <div className="pomodoro-info">
        {task ? (
          <>
            <div className="pomodoro-subject">{task.subject_name}</div>
            {task.topic_name && <div className="pomodoro-topic">📌 {task.topic_name}</div>}
          </>
        ) : (
          <div className="pomodoro-subject">Free session</div>
        )}
        <div className="pomodoro-adaptive-label">
          {avgQualityScore > 0.75
            ? '⚡ Extended session (great performance!)'
            : avgQualityScore < 0.45
            ? '💙 Shorter session (take it easy)'
            : '⏱ Standard session'}
          &nbsp;· {sessionMinutes} min
        </div>
      </div>

      <div className="pomodoro-controls">
        {state.phase === 'running' ? (
          <button id="btn-pomodoro-pause" className="pomodoro-btn" onClick={pause}>
            <Pause size={20} />
          </button>
        ) : (
          <button id="btn-pomodoro-start" className="pomodoro-btn primary" onClick={start}
            disabled={state.phase === 'done'}>
            <Play size={20} />
          </button>
        )}
        <button id="btn-pomodoro-reset" className="pomodoro-btn" onClick={reset}>
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
}
