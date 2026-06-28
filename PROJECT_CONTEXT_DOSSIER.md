# StudyAI Project Context Dossier

This document is meant to be sent to an external language model so it can understand this repository in depth without reading the code directly. It captures the system architecture, runtime behavior, database design, backend logic, frontend flow, and the role of each meaningful file.

## 1. Project Identity

- Project name: `StudyAI`
- Product type: full-stack adaptive study planning web app
- Goal: generate a personalized study schedule, then continuously adapt it based on completed, skipped, or missed sessions
- Frontend stack: React 19 + Vite + React Router + Axios + Recharts + Lucide React
- Backend stack: Flask + Flask-CORS + SQLite
- Data storage: local SQLite database at `backend/database.db`
- Local dev ports:
  - Frontend: `http://localhost:5173`
  - Backend: `http://localhost:5000`

## 2. High-Level System Model

The application works as a closed feedback loop:

1. User is created with study preferences such as `daily_hours` and `peak_time`.
2. User adds subjects with proficiency, difficulty, optional exam dates, and optional topics.
3. Backend computes per-subject priority scores.
4. Backend generates study tasks for upcoming days based on those priorities and the user's available study hours.
5. User logs feedback for each session as completed or skipped.
6. Backend updates completion rate, time spent, and proficiency estimates.
7. Missed or skipped work is rescheduled with higher urgency.
8. Insights and analytics are derived from accumulated tasks and session logs.

Conceptually, the app is not using an external AI service. The "AI" behavior is rule-based scoring and adaptation implemented locally in Python.

## 3. Repository Layout

Top-level authored structure:

```text
s&ul/
├─ backend/
│  ├─ app.py
│  ├─ models.py
│  ├─ scheduler.py
│  ├─ adaptive.py
│  ├─ analytics.py
│  ├─ requirements.txt
│  └─ database.db
├─ frontend/
│  ├─ src/
│  │  ├─ api/
│  │  ├─ components/
│  │  ├─ context/
│  │  ├─ pages/
│  │  ├─ App.jsx
│  │  ├─ App.css
│  │  ├─ index.css
│  │  └─ main.jsx
│  ├─ public/
│  ├─ index.html
│  ├─ package.json
│  ├─ vite.config.js
│  ├─ eslint.config.js
│  ├─ dist/
│  └─ node_modules/
├─ README.md
└─ start.bat
```

Important distinction:

- `frontend/src/**`, `backend/*.py`, root `README.md`, and `start.bat` are authored project files.
- `frontend/node_modules/**` is dependency install output.
- `frontend/dist/**` is frontend build output.
- `backend/__pycache__/**` is Python cache output.

## 4. Runtime Architecture

### Frontend

- Single-page React application.
- Uses client-side routing with `react-router-dom`.
- Stores logged-in user ID in `localStorage` under `studyai_user_id`.
- Talks to backend through Axios using relative `/api` routes.
- Vite dev server proxies `/api` to Flask.

### Backend

- Flask app exposes JSON REST endpoints under `/api`.
- Initializes SQLite schema automatically on startup.
- Does not use ORM; all database access is raw `sqlite3`.
- Logic is separated into modules:
  - `models.py`: schema and DB helpers
  - `scheduler.py`: schedule generation and priority scoring
  - `adaptive.py`: feedback processing and rescheduling
  - `analytics.py`: chart/stat/history computation

### Persistence

- All core data is local and stateful in `backend/database.db`.
- Tables persist users, subjects, topics, tasks, and session logs.

## 5. Core Business Logic

### 5.1 Priority Scoring

The main prioritization formula is in `backend/scheduler.py` inside `compute_priority_score(...)`.

Inputs:

- `proficiency`
- `difficulty`
- `exam_date_str`
- `completion_rate`
- `rescheduled_count`

Signal interpretation:

- Lower proficiency increases urgency.
- Higher difficulty increases urgency.
- Nearer exam dates increase urgency.
- Lower completion rate increases urgency.
- Repeated rescheduling increases urgency.

Weighted formula:

```text
score =
  weakness * 3.0 +
  urgency * 3.5 +
  diff_factor * 2.0 +
  completion_penalty * 1.0 +
  reschedule_boost * 0.5
```

Important implementation details:

- Proficiency is inverted via `(6 - proficiency) / 5.0`
- Difficulty is normalized by `difficulty / 5.0`
- Exam urgency is bucketed by days remaining
- Completion penalty is `1.0 - (completion_rate * 0.3)`
- Reschedule boost is capped at `0.3`
- Returned score is capped at `10.0`

### 5.2 Schedule Generation

Schedule generation is implemented in `backend/scheduler.py` in `generate_schedule(user_id, days=7)`.

Process:

1. Load user profile.
2. Load all subjects for the user.
3. Recompute each subject's priority score and save it back into the DB.
4. Sort subjects descending by priority score.
5. Build daily tasks for the next `days`.
6. Skip any date that already has tasks for that user.
7. Allocate hours proportionally by subject priority.
8. Assign preferred time slots based on `peak_time`.
9. If any exam is within 7 days of a scheduled date, enable exam mode and boost high-priority subjects.
10. Use the first incomplete topic for a subject if topics exist.
11. Insert generated tasks into `tasks`.

Scheduling characteristics:

- Minimum allocated duration per subject is `0.5` hours.
- Peak time slot pools:
  - `morning`: `07:00`, `08:00`, `09:00`, `10:00`
  - `afternoon`: `13:00`, `14:00`, `15:00`, `16:00`
  - `evening`: `18:00`, `19:00`, `20:00`, `21:00`
  - `night`: `21:00`, `22:00`, `23:00`, `00:00`
- Existing daily tasks are not overwritten; the function simply skips those dates.

### 5.3 Adaptive Feedback Loop

Adaptive behavior is implemented in `backend/adaptive.py`.

When feedback is submitted through `process_task_feedback(...)`:

1. The task status is updated.
2. A session log row is inserted into `session_logs`.
3. The subject is updated:
   - completed session:
     - `total_hours_spent` increases
     - proficiency changes slightly based on difficulty feedback
     - completion rate trends upward
   - skipped or missed session:
     - completion rate drops
     - task is rescheduled to a later day
4. Subject priority score is recomputed.

Difficulty feedback effects on proficiency:

- `5` => proficiency `-0.2`
- `1` => proficiency `+0.2`
- `2` => proficiency `+0.1`
- other values => no change

Skipped or missed tasks:

- are rescheduled by `_reschedule_missed_task(...)`
- copy the original task data
- are inserted as a new `pending` task
- get `priority_score + 1.5`, capped at `10`
- increment `rescheduled_count`

### 5.4 Daily Adaptive Update

`run_adaptive_update(user_id)` automatically checks yesterday's pending tasks.

For each pending task from yesterday:

- mark task as `missed`
- reduce subject completion rate more aggressively
- create a rescheduled replacement task

This function is triggered in two places:

- explicitly by `POST /api/adaptive/update/<user_id>`
- implicitly before dashboard data load and before schedule generation from some flows

### 5.5 Insights

`get_insights(user_id)` generates lightweight rule-based advice.

It creates insight cards and recommendation strings using:

- low proficiency
- low completion rate
- high completion + high proficiency
- upcoming exams within 7 days

Output shape:

- `insights`: up to 8 message objects
- `recommendations`: up to 5 short recommended actions

### 5.6 Analytics

`backend/analytics.py` computes:

- subject-wise study time and summary metrics
- 14-day completion trend
- 7-day daily hours studied trend
- aggregate stats:
  - total tasks
  - completed tasks
  - skipped tasks
  - completion rate
  - total hours
  - study streak
- recent history from session logs

Study streak definition:

- walks backward up to 60 days
- increments streak for each day with at least one completed task
- stops when it hits a past day with no completed task

## 6. Database Schema

Defined in `backend/models.py` by `init_db()`.

### `users`

- `id`
- `name`
- `daily_hours`
- `peak_time`
- `created_at`

Purpose:

- stores user identity and study preference inputs used by the scheduler

### `subjects`

- `id`
- `user_id`
- `name`
- `proficiency`
- `difficulty`
- `exam_date`
- `priority_score`
- `total_hours_spent`
- `completion_rate`

Purpose:

- persistent profile of each subject
- primary unit for priority scoring

### `topics`

- `id`
- `subject_id`
- `name`
- `proficiency`
- `completed`

Purpose:

- optional decomposition of subjects into smaller units
- scheduler currently uses the first incomplete topic when creating tasks

### `tasks`

- `id`
- `user_id`
- `subject_id`
- `topic_id`
- `scheduled_date`
- `scheduled_time`
- `duration_hours`
- `status`
- `difficulty_feedback`
- `rescheduled_count`
- `priority_score`
- `created_at`

Purpose:

- actual schedule items shown in dashboard and feedback flows

Status values used in the app:

- `pending`
- `completed`
- `skipped`
- `missed`

### `session_logs`

- `id`
- `user_id`
- `task_id`
- `subject_id`
- `date`
- `hours_studied`
- `status`
- `difficulty_feedback`
- `notes`
- `created_at`

Purpose:

- immutable history used for analytics and performance summaries

## 7. API Surface

Exposed from `backend/app.py`.

### User APIs

- `POST /api/user`
  - creates a user
- `GET /api/user/<user_id>`
  - fetches one user
- `PUT /api/user/<user_id>`
  - updates user profile

### Subject APIs

- `GET /api/subjects/<user_id>`
  - returns all subjects ordered by descending priority
- `POST /api/subjects`
  - creates subject and optional topics
- `PUT /api/subjects/<subject_id>`
  - updates subject fields
- `DELETE /api/subjects/<subject_id>`
  - deletes subject plus related topics and tasks

### Schedule APIs

- `POST /api/schedule/generate/<user_id>`
  - optional JSON body with `days`
  - runs adaptive update first
  - generates new tasks
- `GET /api/schedule/today/<user_id>`
  - today's schedule with subject/topic joins
- `GET /api/schedule/week/<user_id>`
  - next 7 days schedule with subject/topic joins

### Task / Feedback APIs

- `POST /api/tasks/feedback`
  - logs session feedback and triggers adaptation
- `GET /api/tasks/<user_id>`
  - returns all tasks with subject/topic names

### Insight / Analytics APIs

- `GET /api/insights/<user_id>`
- `GET /api/analytics/<user_id>`
- `GET /api/history/<user_id>?limit=<n>`
- `POST /api/adaptive/update/<user_id>`

### Health

- `GET /api/health`

## 8. Frontend Application Flow

### 8.1 Boot

Entry point is `frontend/src/main.jsx`.

- mounts `<App />` into `#root`
- wraps app in `StrictMode`

`frontend/src/App.jsx` defines the global route shell.

Behavior:

- If `userId` does not exist in context, only onboarding is accessible.
- If `userId` exists, app renders sidebar + authenticated routes.
- Routes:
  - `/dashboard`
  - `/subjects`
  - `/feedback`
  - `/analytics`

### 8.2 Global App State

Managed in `frontend/src/context/AppContext.jsx`.

State owned here:

- `userId`
- `user`
- `toasts`

Responsibilities:

- hydrate `userId` from `localStorage`
- fetch full user object when a stored user ID exists
- clear invalid local state if backend user lookup fails
- expose `login`, `logout`, `addToast`

Toast system:

- local in-memory array
- auto-removes entries after 3.5 seconds
- rendered by `ToastContainer`

### 8.3 API Client

`frontend/src/api/client.js` centralizes all HTTP calls.

Important behavior:

- Axios `baseURL` is `/api`
- 10 second timeout
- all frontend pages import thin wrappers from this file

## 9. Frontend Screen-by-Screen Behavior

### Onboarding Page

File: `frontend/src/pages/Onboarding.jsx`

Purpose:

- initial setup for new user
- 2-step flow:
  - step 1: user identity and study preferences
  - step 2: subjects, proficiency, difficulty, exam dates, topics

Key operations:

1. `createUser(formData)`
2. loop over subjects and call `addSubject(...)`
3. `generateSchedule(uid, 7)`
4. `login(...)`
5. navigate to `/dashboard`

Important local structures:

- `DEFAULT_SUBJECT`
- slider labels for proficiency and difficulty
- dynamic topic add/remove UI

### Dashboard Page

File: `frontend/src/pages/Dashboard.jsx`

Purpose:

- main operational view of today's study system state

Primary API calls during load:

- `runAdaptiveUpdate(userId)`
- `getTodaySchedule(userId)`
- `getWeekSchedule(userId)`
- `getInsights(userId)`
- `getSubjects(userId)`

UI sections:

- greeting and regenerate button
- stats row for today's progress
- weekly mini calendar
- task list for today or selected day
- subject priority cards
- AI insights and recommendations
- modal for submitting task feedback

Important behaviors:

- "Regenerate Plan" calls `generateSchedule(userId, 7)`
- logging a session opens a modal and posts to `submitFeedback(...)`
- selected day switches task list from today to that date's tasks

### Subjects Page

File: `frontend/src/pages/Subjects.jsx`

Purpose:

- CRUD screen for subjects

Capabilities:

- list subjects with current priority and metrics
- add subject
- inline edit subject
- delete subject

Important implementation behavior:

- after add and after edit, it calls `generateSchedule(userId, 7)`
- delete removes subject data but does not trigger a schedule regeneration afterward

Displayed per subject:

- priority score
- proficiency
- difficulty
- completion rate
- total hours studied
- exam countdown badge

### Feedback Page

File: `frontend/src/pages/Feedback.jsx`

Purpose:

- dedicated task logging screen across all tasks, not just today's dashboard

Primary data:

- `getAllTasks(userId)`
- `getSubjects(userId)`

Filters:

- subject
- status

For pending tasks:

- lets user choose completed vs skipped
- if completed, enter hours and difficulty
- notes are optional
- submits through `submitFeedback(...)`

For non-pending tasks:

- shows logged state and summary only

### Analytics Page

File: `frontend/src/pages/Analytics.jsx`

Purpose:

- performance reporting and history visualization

Primary data:

- `getAnalytics(userId)`
- `getHistory(userId, 30)`

Tabs:

- `overview`
- `trends`
- `subjects`
- `history`

Visualization library:

- `recharts`

Visuals rendered:

- 14-day completion area chart
- 7-day hours bar chart
- subject time pie chart
- completed vs skipped bar trend
- completion-rate line chart
- subject priority horizontal bar chart
- subject performance summary table
- session history list

## 10. UI Infrastructure Components

### Navbar

File: `frontend/src/components/Navbar.jsx`

Responsibilities:

- authenticated sidebar navigation
- shows user initial and daily hours
- sign-out button clears context and routes back to onboarding

### ToastContainer

File: `frontend/src/components/ToastContainer.jsx`

Responsibilities:

- renders transient notifications from context
- maps toast type to Lucide icon

## 11. Styling / Design System

Main styling base is `frontend/src/index.css`.

It defines:

- CSS custom properties for colors, gradients, typography, spacing, shadows
- dark visual theme
- reusable UI primitives:
  - `.glass-card`
  - `.btn*`
  - `.form-*`
  - `.badge*`
  - grid helpers
  - loading spinner
  - toast container
  - empty states

Design direction:

- premium dark theme
- purple/cyan accent palette
- glassmorphism-style cards
- responsive layout that collapses the sidebar margin on smaller screens

Screen-specific CSS files:

- `frontend/src/pages/Onboarding.css`
- `frontend/src/pages/Dashboard.css`
- `frontend/src/pages/Subjects.css`
- `frontend/src/pages/Feedback.css`
- `frontend/src/pages/Analytics.css`
- `frontend/src/components/Navbar.css`

These files primarily control layout and presentation for their paired components.

## 12. Build / Dev Configuration

### Frontend package

File: `frontend/package.json`

Scripts:

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run preview`

Dependencies:

- `axios`
- `lucide-react`
- `react`
- `react-dom`
- `react-router-dom`
- `recharts`

### Vite config

File: `frontend/vite.config.js`

Important behavior:

- runs on port `5173`
- proxies `/api` to `http://localhost:5000`

### ESLint config

File: `frontend/eslint.config.js`

Important behavior:

- flat config style
- ignores `dist`
- enables standard JS recommendations plus React hooks and Vite refresh rules

### Backend requirements

File: `backend/requirements.txt`

Dependencies:

- `flask`
- `flask-cors`

## 13. Startup Flow

### Manual

Backend:

```bash
cd backend
python app.py
```

Frontend:

```bash
cd frontend
npm run dev
```

### Automated helper

File: `start.bat`

What it does:

1. starts Flask backend in a new command window
2. waits 3 seconds
3. starts Vite in a new command window
4. waits 5 seconds
5. opens browser to frontend URL

## 14. File-by-File Source Inventory

### Root

#### `README.md`

- project overview
- feature summary
- setup instructions
- simplified project structure
- high-level explanation of the scheduling formula and API endpoints

#### `start.bat`

- Windows launcher for local backend + frontend startup

### Backend

#### `backend/app.py`

- Flask entry point
- enables CORS for local frontend origins
- initializes database at import time
- defines every REST endpoint
- wires route handlers to logic modules

#### `backend/models.py`

- DB path configuration
- SQLite connection helper
- schema creation
- small row conversion helpers

#### `backend/scheduler.py`

- scoring formula
- schedule generation engine
- daily and weekly schedule retrieval helpers

#### `backend/adaptive.py`

- session feedback processor
- skipped/missed task rescheduler
- automatic daily adaptive update
- recommendation/insight generator

#### `backend/analytics.py`

- analytics aggregation queries
- trend building
- stats calculation
- history retrieval

#### `backend/requirements.txt`

- minimal Python dependency manifest

#### `backend/database.db`

- live SQLite database file
- environment data, not source logic

### Frontend core

#### `frontend/index.html`

- root HTML shell
- sets title, description, font imports
- mounts React app into `#root`

#### `frontend/package.json`

- frontend scripts and dependency manifest

#### `frontend/vite.config.js`

- Vite React plugin config
- local API proxy

#### `frontend/eslint.config.js`

- lint setup

### Frontend source

#### `frontend/src/main.jsx`

- React bootstrap

#### `frontend/src/App.jsx`

- route gatekeeping based on auth-like local user presence
- authenticated and unauthenticated route trees

#### `frontend/src/index.css`

- global theme and reusable visual primitives

#### `frontend/src/App.css`

- leftover Vite template stylesheet
- appears unused by current app code
- not part of active StudyAI flow

#### `frontend/src/api/client.js`

- Axios instance
- all request wrappers for backend endpoints

#### `frontend/src/context/AppContext.jsx`

- global app state holder
- local storage persistence
- user hydration
- toast management

#### `frontend/src/components/Navbar.jsx`

- sidebar navigation + logout

#### `frontend/src/components/Navbar.css`

- sidebar styling

#### `frontend/src/components/ToastContainer.jsx`

- toast renderer

#### `frontend/src/pages/Onboarding.jsx`

- first-time setup wizard
- user + subject creation
- initial schedule generation

#### `frontend/src/pages/Onboarding.css`

- onboarding-specific layout and visual styling

#### `frontend/src/pages/Dashboard.jsx`

- main home screen
- weekly view, today tasks, insights, quick logging modal

#### `frontend/src/pages/Dashboard.css`

- dashboard-specific layout and visual styling

#### `frontend/src/pages/Subjects.jsx`

- manage subject records

#### `frontend/src/pages/Subjects.css`

- subjects page styling

#### `frontend/src/pages/Feedback.jsx`

- task logging workspace for all tasks

#### `frontend/src/pages/Feedback.css`

- feedback page styling

#### `frontend/src/pages/Analytics.jsx`

- reports, charts, history

#### `frontend/src/pages/Analytics.css`

- analytics page styling

### Frontend assets / public

#### `frontend/public/favicon.svg`

- favicon asset

#### `frontend/public/icons.svg`

- static icon asset

#### `frontend/src/assets/hero.png`

- image asset present in source tree

#### `frontend/src/assets/react.svg`
#### `frontend/src/assets/vite.svg`

- default template assets still present
- not central to product logic

## 15. End-to-End Data Flow Example

Example lifecycle for one subject:

1. User adds subject "Mathematics" with:
   - proficiency `2`
   - difficulty `4`
   - exam in 5 days
2. Scheduler computes a high priority score because:
   - low proficiency raises weakness
   - high difficulty raises difficulty factor
   - exam soon raises urgency heavily
3. Scheduler assigns Mathematics a time slot and duration in upcoming tasks.
4. User studies the session and logs it as completed with difficulty `5`.
5. Backend:
   - marks task completed
   - inserts a `session_logs` record
   - adds hours to `total_hours_spent`
   - slightly reduces proficiency estimate because user reported it very hard
   - recalculates priority score
6. If the user skipped instead:
   - completion rate decreases
   - a replacement task is inserted for a future day
   - replacement task gets higher priority
7. Analytics later reflect:
   - updated total hours
   - improved or degraded completion trend
   - history entry for the session

## 16. Non-Obvious Implementation Notes

- This is a single-user local app model, even though the schema technically supports multiple users.
- Authentication is not real auth; the frontend just stores `userId` in local storage.
- SQLite foreign keys are declared in schema but no explicit pragma enabling foreign key enforcement is set in code.
- Subject deletion manually deletes related topics and tasks instead of relying on cascading constraints.
- Schedule generation avoids overwriting existing dates, so repeated generation may not fully rebuild plans.
- The scheduler always chooses only the first incomplete topic for a subject when creating a task.
- Topic progress is stored in the DB schema, but the current feedback flow does not mark topics completed.
- `frontend/src/App.css` looks like unused starter-template CSS and can be considered non-core.
- `frontend/dist` and `frontend/node_modules` should not be treated as authored logic.
- The project branding says "AI", but implementation is deterministic local heuristics, not LLM-backed intelligence.

## 17. Critical Files to Read First If Re-Entering The Codebase

If an external model wants the fastest path to understanding the system, read in this order:

1. `backend/app.py`
2. `backend/scheduler.py`
3. `backend/adaptive.py`
4. `backend/analytics.py`
5. `backend/models.py`
6. `frontend/src/App.jsx`
7. `frontend/src/context/AppContext.jsx`
8. `frontend/src/api/client.js`
9. `frontend/src/pages/Dashboard.jsx`
10. `frontend/src/pages/Onboarding.jsx`
11. `frontend/src/pages/Subjects.jsx`
12. `frontend/src/pages/Feedback.jsx`
13. `frontend/src/pages/Analytics.jsx`
14. `frontend/src/index.css`

## 18. Short Summary For An External LM

This repository is a full-stack adaptive study planner called StudyAI. The backend is a Flask app backed by SQLite and split into modules for schema, scheduling, adaptive feedback, and analytics. The frontend is a React + Vite SPA with onboarding, dashboard, subject management, task feedback, and analytics screens. The system's core logic is a rule-based priority engine: subjects are scored from proficiency, difficulty, exam proximity, completion rate, and reschedule count; those scores drive task generation; user feedback modifies subject metrics; missed work is rescheduled with higher priority; analytics and insights are computed from tasks and session logs. The most important backend files are `app.py`, `scheduler.py`, `adaptive.py`, and `analytics.py`, while the most important frontend files are `App.jsx`, `AppContext.jsx`, `client.js`, and the page components in `src/pages/`.
