import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard, BookOpen, BarChart3, MessageSquare, LogOut,
  Brain, Timer, Bot, Scan, RotateCcw, ChevronUp, BrainCircuit,
  Menu, X
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
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeItem = useMemo(
    () => NAV_ITEMS.find((item) => location.pathname.startsWith(item.to)) || NAV_ITEMS[0],
    [location.pathname]
  );

  useEffect(() => {
    setMobileOpen(false);
    setShowDropdown(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

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
    <>
      <div className="mobile-topbar">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
          aria-controls="main-sidebar"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div className="mobile-topbar-brand">
          <div className="logo-icon mobile-logo-icon">
            <Brain size={18} />
          </div>
          <div className="mobile-topbar-copy">
            <div className="mobile-topbar-title">StudyAI</div>
            <div className="mobile-topbar-subtitle">{activeItem.label}</div>
          </div>
        </div>

        {user && (
          <div className="mobile-user-chip" aria-hidden="true">
            {user.email?.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <button
        type="button"
        className={`sidebar-overlay ${mobileOpen ? 'visible' : ''}`}
        aria-label="Close navigation overlay"
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`} id="main-sidebar">
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
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom section dropdown menu */}
        <div className="sidebar-bottom">
          {user && showDropdown && (
            <div className="user-dropdown-menu">
              <button className="sidebar-link dropdown-action dropdown-danger" onClick={handleReset}>
                <RotateCcw size={16} />
                <span>Reset My Data</span>
              </button>
              <button className="sidebar-link dropdown-action" onClick={handleLogout}>
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          )}

          {user && (
            <button
              className="sidebar-user sidebar-user-button"
              onClick={() => setShowDropdown(!showDropdown)}
            >
              <div className="user-avatar">
                {user.email?.charAt(0).toUpperCase()}
              </div>
              <div className="user-info">
                <div className="user-name">
                  {user.name || user.email}
                </div>
                <div className="user-role">
                  {user.email}
                </div>
              </div>
              <ChevronUp
                size={16}
                className={`user-chevron ${showDropdown ? 'open' : ''}`}
              />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
