# Developer Onboarding — Baakhapaa

Read this first if you (or anyone else) is picking up this codebase.
Estimated time to first working local run: 15 minutes.

## 1. Read These Files First (in order)

1. `CLAUDE.md` — current state, conventions, what's working/not working
2. `PRD.md` — what we're building and why
3. `TRD.md` — how it's architected
4. `LEARNING_GUIDE.md` — if you're newer to full-stack web dev, start here
   instead of diving into code cold

## 2. Local Setup

```bash
# Backend
cd baakhapaa-backend
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # Mac/Linux
pip install -r requirements.txt
uvicorn main:app --reload      # Mac/Linux fine with --reload
# On Windows: drop --reload (see CLAUDE.md Windows gotchas), restart
# manually after edits instead

# Frontend (new terminal)
cd baakhapaa-frontend
npm install
npm start
```

Visit `localhost:8000/health` → should show `{"status":"ok"}`
Visit `localhost:3000` (or 3001) → app loads

**No real API keys yet?** That's fine — the app runs in **demo mode**
automatically (mock database, mock AI responses). Login with
`test@example.com` / `password` to explore immediately.

## 3. Getting Real API Keys (when ready to move past demo mode)

| Key | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `OPENAI_API_KEY` | platform.openai.com |
| `SUPABASE_URL` / `SUPABASE_KEY` | Your Supabase project → Settings → API |

Add these to `baakhapaa-backend/.env`, then run `supabase_schema.sql` in
your Supabase project's SQL Editor to create all tables.

## 4. How to Actually Learn This Codebase

Don't try to read every file top to bottom. Instead, **trace one feature
end-to-end** — this is covered in detail in `LEARNING_GUIDE.md`, but the
short version:

```
Frontend page → services/api.js → Backend route → auth check →
database.py → response back to frontend
```

Trace "user logs in" first — it touches every layer and is the simplest
complete example. Then trace "generate script" the same way.

## 5. Making Your First Change

1. Pick one small, isolated task (a CSS fix, a copy change, a new field)
2. Make the change
3. Run both servers, test in browser
4. `git add . && git commit -m "clear description of what changed"`

**Never** bundle unrelated changes in one commit — makes it hard to revert
if something breaks later.

## 6. Before You Touch Auth, Payments, or Data Access Code

Read `AUDIT_REPORT.md` first. Several subtle security fixes are already in
place (`require_script_access()`, field whitelists) — understand why
they're there before modifying anything nearby, so you don't accidentally
reopen a fixed vulnerability.

## 7. Who to Ask

Project owner: Shubham — [YOUR EMAIL / CONTACT]

## 8. Document Map

| Doc | Purpose |
|---|---|
| CLAUDE.md | Live project state, conventions |
| PRD.md | Product requirements |
| TRD.md | Technical architecture |
| LEARNING_GUIDE.md | Beginner-friendly codebase walkthrough |
| AUDIT_REPORT.md | Security audit findings |
| HANDOVER.md | Latest session's test results |
| README.md | Quick setup reference |
| Terms_of_Use.md / Privacy_Policy.md / Data_Compliance_Checklist.md | Legal |
