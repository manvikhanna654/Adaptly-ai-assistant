import axios from 'axios';

// Use environment variable if set, otherwise fall back to the Render backend
const BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/+$/, '').replace(/\/api$/, '') + '/api'
  : 'https://adaptly-ai-assistant.onrender.com/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sf_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      const isAuthPage = currentPath === '/login' || currentPath === '/register';
      if (!isAuthPage) {
        localStorage.removeItem('sf_token');
        // Use replace so back-button doesn't loop
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ───────────────────────────────────────────
export const loginUser = (data) => api.post('/auth/login', data);
export const registerUser = (data) => api.post('/auth/register', data);
export const resetUser = () => api.delete('/user/reset');

// ─── User ───────────────────────────────────────────
export const getMe = () => api.get('/user/me');
export const updateMe = (data) => api.put('/user/me', data);
export const createUser = (data) => api.post('/user', data);
export const getUser = (userId) => api.get(`/user/${userId}`);
export const updateUser = (userId, data) => api.put(`/user/${userId}`, data);

// ─── Subjects ───────────────────────────────────────
export const getSubjects = (userId) => api.get(`/subjects/${userId}`);
export const addSubject = (data) => api.post('/subjects', data);
export const updateSubject = (subjectId, data) => api.put(`/subjects/${subjectId}`, data);
export const deleteSubject = (subjectId) => api.delete(`/subjects/${subjectId}`);

// ─── Schedule ────────────────────────────────────────
export const generateSchedule = (userId, days = 7) =>
  api.post(`/schedule/generate/${userId}`, { days });
export const getTodaySchedule = (userId) => api.get(`/schedule/today/${userId}`);
export const getWeekSchedule = (userId) => api.get(`/schedule/week/${userId}`);
export const getAllTasks = (userId) => api.get(`/tasks/${userId}`);

// ─── Feedback ────────────────────────────────────────
export const submitFeedback = (data) => api.post('/tasks/feedback', data);

// ─── Insights & Analytics ────────────────────────────
export const getInsights = (userId) => api.get(`/insights/${userId}`);
export const getAnalytics = (userId) => api.get(`/analytics/${userId}`);
export const getHistory = (userId, limit = 50) =>
  api.get(`/history/${userId}`, { params: { limit } });
export const runAdaptiveUpdate = (userId) =>
  api.post(`/adaptive/update/${userId}`);

// ─── Topics / Confidence ─────────────────────────────
export const getTopics = (userId) => api.get(`/topics/${userId}`);

// ─── Goals ───────────────────────────────────────────
export const setGoal = (userId, data) => api.post(`/goals/${userId}`, data);

// ─── Burnout ─────────────────────────────────────────
export const getBurnout = (userId) => api.get(`/burnout/${userId}`);

// —— Study Coach Chat ————————————————————————————————————
export const chatWithCoach = (userId, data) => api.post(`/chat/${userId}`, data);
export const scanNote = (formData) =>
  api.post('/note-scan', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
export const saveSubjectFromScan = (data) => api.post('/subjects/from-scan', data);

// ─── Quiz Generator ──────────────────────────────────────────────
export const generateQuiz = (data) =>
  api.post('/quiz/generate', data, { timeout: 120000 });
export const generateQuizFromUpload = (formData) =>
  api.post('/quiz/generate-from-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
export const saveQuiz = (data) => api.post('/quiz/save', data);
export const getQuizHistory = () => api.get('/quiz/history');

export default api;
