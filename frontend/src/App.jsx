import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Navbar from './components/Navbar';
import ToastContainer from './components/ToastContainer';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Subjects from './pages/Subjects';
import Feedback from './pages/Feedback';
import Analytics from './pages/Analytics';
import Digest, { shouldShowDigest } from './pages/Digest';
import Timer from './pages/Timer';
import Coach from './pages/Coach';
import NoteScanner from './pages/NoteScanner';
import QuizGenerator from './pages/QuizGenerator';
import Login from './pages/Login';
import Register from './pages/Register';
import { initReminders } from './utils/notifications';
import './index.css';

// Checks shouldShowDigest() ONCE at mount (not on every re-render).
// This prevents the redirect loop: Digest calls markDigestShown() then navigate('/dashboard'),
// but a re-render of the route used to re-check shouldShowDigest() before localStorage was updated.
function DashboardGuard() {
  const [redirect] = React.useState(() => shouldShowDigest());
  if (redirect) return <Navigate to="/digest" replace />;
  return <Dashboard />;
}

function PrivateRoute({ children, reqOnboarding = true }) {
  const { token, user, authLoading } = useApp();
  if (authLoading) return null; // wait for auth to resolve before redirecting
  if (!token) return <Navigate to="/login" replace />;
  if (user && reqOnboarding && !user.onboarding_complete) return <Navigate to="/" replace />;
  if (user && !reqOnboarding && user.onboarding_complete) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppContent() {
  const { user, token, authLoading } = useApp();

  useEffect(() => {
    if (user?.id) initReminders([]);
  }, [user?.id]);

  // Show nothing (or a spinner) while we verify the stored token
  if (authLoading) {
    return null;
  }

  if (!token) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <ToastContainer />
      </>
    );
  }

  return (
    <div className="app-layout">
      {user?.onboarding_complete && <Navbar />}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<PrivateRoute reqOnboarding={false}><Onboarding /></PrivateRoute>} />
          <Route path="/digest" element={<PrivateRoute><Digest /></PrivateRoute>} />
          <Route path="/dashboard" element={<PrivateRoute><DashboardGuard /></PrivateRoute>} />
          <Route path="/subjects" element={<PrivateRoute><Subjects /></PrivateRoute>} />
          <Route path="/feedback" element={<PrivateRoute><Feedback /></PrivateRoute>} />
          <Route path="/analytics" element={<PrivateRoute><Analytics /></PrivateRoute>} />
          <Route path="/coach" element={<PrivateRoute><Coach /></PrivateRoute>} />
          <Route path="/timer" element={<PrivateRoute><Timer /></PrivateRoute>} />
          <Route path="/scanner" element={<PrivateRoute><NoteScanner /></PrivateRoute>} />
          <Route path="/quiz" element={<PrivateRoute><QuizGenerator /></PrivateRoute>} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </BrowserRouter>
  );
}
