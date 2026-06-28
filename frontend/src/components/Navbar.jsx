import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard, BookOpen, BarChart3, MessageSquare, LogOut,
  Zap, Brain, Timer, Bot, Scan, RotateCcw, ChevronUp, BrainCircuit
} from 'lucide-react';
import { resetUser } from '../api/client';
import './Navbar.css';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/coach', label: 'Coach', icon: Bot },
  { to: '/scanner', label: 'Scanner', icon: Scan },
  { to: '/quiz', label: 'Quiz', icon: BrainCircuit },
  { to: '/timer', label: 'Timer', icon: Timer },
  { to: '/subjects', label: 'Subjects', icon: BookOpen },
  { to: '/feedback', label: 'Feedback', icon: MessageSquare },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

export default function Navbar() {
  const { user, logout, setUser } = useApp();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleLogout = () => {
    logout();
  };

  const handleReset = async () => {
    if (window.confirm("Are you sure? This will delete all your study data but keep your account.")) {
      try {
        await resetUser();
        setUser((prev) => ({ ...prev, onboarding_complete: 0 }));
        navigate('/');
      } catch (err) {
        console.error('Reset failed:', err);
      }
    }
  };

  return (
    <aside className="sidebar" id="main-sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <Brain size={20} />
        </div>
        <div>
          <div className="logo-text">StudyAI</div>
          <div className="logo-sub">Adaptive Coach</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
            id={`nav-${label.toLowerCase()}`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom section dropdown menu */}
      <div className="sidebar-bottom" style={{ position: 'relative' }}>
        {user && showDropdown && (
          <div className="user-dropdown-menu" style={{ position: 'absolute', bottom: '100%', left: '1rem', right: '1rem', marginBottom: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.5rem', zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <button className="sidebar-link text-danger" onClick={handleReset} style={{ color: 'var(--accent-red)', padding: '0.5rem', width: '100%', borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <RotateCcw size={16} />
              <span>Reset My Data</span>
            </button>
            <button className="sidebar-link logout-btn" onClick={handleLogout} style={{ padding: '0.5rem', width: '100%', borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        )}
        
        {user && (
          <button 
            className="sidebar-user" 
            style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', outline: 'none' }} 
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <div className="user-avatar">
              {user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="user-info" style={{ textAlign: 'left', flex: 1 }}>
              <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                 {user.name || user.email}
              </div>
              <div className="user-role" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                 {user.email}
              </div>
            </div>
            <ChevronUp size={16} style={{ color: 'var(--text-muted)', transform: showDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
        )}
      </div>
    </aside>
  );
}
