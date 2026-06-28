import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { loginUser, registerUser } from '../api/client';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('sf_token') || null);
  const [user, setUser] = useState(null);
  const [toasts, setToasts] = useState([]);
  // authLoading stays true until we've verified the token (or found there's none)
  const [authLoading, setAuthLoading] = useState(() => !!localStorage.getItem('sf_token'));
  // Tracks whether the user was just set by login/register so we skip the getMe() call
  const skipGetMe = useRef(false);

  useEffect(() => {
    if (token && !user) {
      if (skipGetMe.current) {
        // user was already set synchronously by login/register — nothing to do
        skipGetMe.current = false;
        setAuthLoading(false);
        return;
      }
      // Restore session from stored token on page load
      localStorage.setItem('sf_token', token);
      import('../api/client').then(({ getMe }) => {
        getMe()
          .then(res => {
            setUser(res.data);
          })
          .catch(() => {
            // Token is invalid/expired — clear everything
            setToken(null);
            setUser(null);
            localStorage.removeItem('sf_token');
          })
          .finally(() => setAuthLoading(false));
      });
    } else if (!token) {
      localStorage.removeItem('sf_token');
      setUser(null);
      setAuthLoading(false);
    } else {
      // token && user already set
      setAuthLoading(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email, password) => {
    const res = await loginUser({ email, password });
    const { access_token, user: userData } = res.data;
    skipGetMe.current = true;
    setToken(access_token);
    setUser(userData);
    localStorage.setItem('sf_token', access_token);
    return res;
  };

  const register = async (email, password) => {
    const res = await registerUser({ email, password });
    const { access_token, user: userData } = res.data;
    skipGetMe.current = true;
    setToken(access_token);
    setUser(userData);
    localStorage.setItem('sf_token', access_token);
    return res;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  return (
    <AppContext.Provider value={{ token, user, userId: user?.id, setUser, login, register, logout, toasts, addToast, authLoading }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
