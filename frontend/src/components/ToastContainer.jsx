import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

const ICONS = {
  success: <CheckCircle2 size={18} color="#10b981" />,
  error: <XCircle size={18} color="#ef4444" />,
  warning: <AlertTriangle size={18} color="#f59e0b" />,
  info: <Info size={18} color="#7c3aed" />,
};

export default function ToastContainer() {
  const { toasts } = useApp();

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {ICONS[t.type] || ICONS.info}
          <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
