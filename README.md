# 🧠 Adaptive AI Study Coach

An intelligent, full-stack web application that generates personalized study schedules and dynamically adapts them based on your performance, habits, and feedback.

---

## 🚀 Features

- **AI-Based Scheduling Engine** – Priority scoring based on proficiency, exam urgency, difficulty, and completion rate
- **Adaptive Rescheduling** – Missed tasks are automatically rescheduled with boosted priority
- **Feedback Learning Loop** – Study session feedback updates subject weights and proficiency estimates
- **Weakness Detection** – Identifies low-performance subjects and generates actionable insights
- **Exam Mode** – Automatically shifts scheduling strategy as exams approach
- **Analytics Dashboard** – Charts for completion trends, hours studied, subject distribution

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Backend | Python Flask |
| Database | SQLite |
| Charts | Recharts |
| Icons | Lucide React |

---

## 📦 Getting Started

### 1. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Start the Backend Server

```bash
copy .env.local.example .env.local
```

Then open `.env.local` and set your real API key:

```bash
LLM_API_KEY=your_api_key_here
LLM_MODEL=gpt-4o-mini
```

After that, you can start everything with:

```bash
start.bat
```

Backend runs on: `http://localhost:5000`

The coach chat now uses an OpenAI-compatible API instead of a local Ollama model.
Optional backend variables:

```bash
set LLM_API_URL=https://api.openai.com/v1/chat/completions
set LLM_API_KEY=your_api_key_here
set LLM_MODEL=gpt-4o-mini
set LLM_TIMEOUT=90
```

### 3. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 4. Start the Frontend Dev Server

```bash
cd frontend
npm run dev
```

Frontend runs on: `http://localhost:5173`

---

## 📁 Project Structure

```
s&ul/
├── backend/
│   ├── app.py          # Flask API server
│   ├── models.py       # SQLite database models
│   ├── scheduler.py    # AI scheduling engine
│   ├── adaptive.py     # Adaptive rescheduling & insights
│   ├── analytics.py    # Analytics computations
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/      # Onboarding, Dashboard, Feedback, Analytics, Subjects
│       ├── components/ # Navbar, ToastContainer
│       ├── api/        # Axios API client
│       └── context/    # Global state (AppContext)
└── README.md
```

---

## 🤖 AI Logic

### Priority Scoring Formula

```
Priority = (Weakness × 3.0) + (Urgency × 3.5) + (Difficulty × 2.0) + (Completion Penalty × 1.0) + (Reschedule Boost × 0.5)
```

Where:
- **Weakness** = inverse of proficiency (lower proficiency = higher score)
- **Urgency** = distance to exam date (closer = higher)
- **Difficulty** = self-assessed difficulty level
- **Completion Penalty** = based on past missed sessions
- **Reschedule Boost** = tasks that were missed get priority boost

### Adaptive Learning
- On session completion: proficiency adjusts based on difficulty feedback
- On skip/miss: completion rate drops, next schedule reflects changes
- Auto-rescheduling runs on each login (daily adaptive update)

---

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/user` | Create user |
| POST | `/api/subjects` | Add subject |
| POST | `/api/schedule/generate/:userId` | Generate 7-day schedule |
| GET | `/api/schedule/today/:userId` | Get today's tasks |
| GET | `/api/schedule/week/:userId` | Get weekly schedule |
| POST | `/api/tasks/feedback` | Submit session feedback |
| GET | `/api/insights/:userId` | Get AI insights |
| GET | `/api/analytics/:userId` | Get analytics data |
