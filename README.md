# Baakhapaa — Setup Instructions

## 1. Backend Setup

```
cd baakhapaa-backend
python -m venv venv
venv\Scripts\activate          (Windows)
source venv/bin/activate       (Mac/Linux)
pip install -r requirements.txt
```

Edit `.env` and add your real keys:
- ANTHROPIC_API_KEY from console.anthropic.com
- OPENAI_API_KEY from platform.openai.com
- SUPABASE_URL and SUPABASE_KEY from your Supabase project settings

Then run the SQL in `supabase_schema.sql` inside your Supabase SQL Editor to create all tables.

Start the server:
```
uvicorn main:app --reload
```

Test at: http://localhost:8000/health — should show {"status":"ok"}
Full API docs at: http://localhost:8000/docs

## 2. Frontend Setup

```
cd baakhapaa-frontend
npm install
npm start
```

Opens at http://localhost:3000

## 3. First Test Flow

1. Register a new account at /register
2. Login
3. Click New Project — fill genre, tone, duration, language
4. Click Generate Structure (calls Claude API — needs real API key)
5. In Script Editor, use AI Assistant to Generate a scene
6. Finalize the script
7. Generate Storyboard (calls DALL-E — needs real API key)
8. Export as PDF

## What's Included

Backend (12 files): main.py, models.py, database.py, auth.py, projects.py,
scripts.py, script_engine.py, storyboard.py, storyboard_engine.py,
versions.py, collaboration.py, export.py, export_service.py

Frontend (14 files): App.jsx, index.js, index.css, AuthContext, 
ProtectedRoute, Sidebar, ProjectCard, api.js, LoginPage, RegisterPage,
Dashboard, NewProject, ScriptEditor, StoryboardView

## Not Yet Built (add later per your Builder's Guide)
- Real time collaboration UI (backend routes exist)
- Version history UI (backend routes exist)
- Subscription/payment UI
- Comment threads UI

Use the AI_Agent_Prompts.md document from our chat to generate these
next, one module at a time, using Claude or AI Studio.
