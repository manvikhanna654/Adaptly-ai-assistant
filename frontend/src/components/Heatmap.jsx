import React, { useState } from 'react';
import './Heatmap.css';

const INTENSITY_COLORS = ['#1a1a2e', '#1c2b4a', '#2e4480', '#5060c8', '#8b7cf8'];

function getIntensity(hours) {
  if (!hours || hours === 0) return 0;
  if (hours < 1) return 1;
  if (hours < 2) return 2;
  if (hours < 3) return 3;
  return 4;
}

function computeStreaks(hoursData) {
  // hoursData is ordered oldest→newest
  let current = 0;
  let longest = 0;
  let temp = 0;
  let totalDays = 0;

  for (const d of hoursData) {
    if ((d.hours || 0) > 0) {
      temp += 1;
      totalDays += 1;
      if (temp > longest) longest = temp;
    } else {
      temp = 0;
    }
  }
  // current streak = tail of array with consecutive non-zero
  for (let i = hoursData.length - 1; i >= 0; i--) {
    if ((hoursData[i].hours || 0) > 0) {
      current += 1;
    } else {
      break;
    }
  }
  return { current, longest, totalDays };
}

export default function Heatmap({ hoursData = [] }) {
  const [tooltip, setTooltip] = useState(null);

  // Slice to exactly 91 entries: 13 weeks × 7 days
  const cells = hoursData.slice(-91);
  // Pad to 91 if less
  while (cells.length < 91) {
    cells.unshift({ date: '', hours: 0, label: '' });
  }

  const { current, longest, totalDays } = computeStreaks(cells);

  return (
    <div className="heatmap-wrapper" id="heatmap">
      <div className="heatmap-stats">
        <div className="heatmap-stat">
          <span className="heatmap-stat-val">{current}</span>
          <span className="heatmap-stat-label">Day Streak</span>
        </div>
        <div className="heatmap-stat">
          <span className="heatmap-stat-val">{longest}</span>
          <span className="heatmap-stat-label">Longest Streak</span>
        </div>
        <div className="heatmap-stat">
          <span className="heatmap-stat-val">{totalDays}</span>
          <span className="heatmap-stat-label">Days Studied</span>
        </div>
      </div>

      <div className="heatmap-grid-container">
        <div className="heatmap-grid">
          {cells.map((cell, i) => {
            const level = getIntensity(cell.hours);
            return (
              <div
                key={i}
                className={`heatmap-cell d${level}`}
                style={{ background: INTENSITY_COLORS[level] }}
                onMouseEnter={(e) => {
                  if (!cell.date) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    x: rect.left + rect.width / 2,
                    y: rect.top - 8,
                    date: cell.date,
                    hours: cell.hours || 0,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        </div>

        <div className="heatmap-legend">
          <span className="heatmap-legend-label">Less</span>
          {INTENSITY_COLORS.map((c, i) => (
            <div key={i} className="heatmap-legend-cell" style={{ background: c }} />
          ))}
          <span className="heatmap-legend-label">More</span>
        </div>
      </div>

      {tooltip && (
        <div
          className="heatmap-tooltip"
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <strong>{tooltip.date}</strong>
          <br />
          {tooltip.hours.toFixed(1)}h studied
        </div>
      )}
    </div>
  );
}
