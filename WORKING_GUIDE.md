# Working Guide — Baakhapaa

How to actually work on this repo day to day: the git topology (which is
unusual and will trip you up), the commit/push loop, the rules that must not
be broken, and how to set up Claude Code on a second machine.

For **first-time local setup** (venv, npm install, API keys) see
`ONBOARDING.md` — that ground isn't repeated here.

---

## 1. The git topology — read this before your first push

This is **two nested git repos**, not one. Both point at the same GitHub
remote, on different branches.

```
D:\AkxyaRup\                     ← WRAPPER repo    → origin/main
├── .claude/                        launch.json, settings.local.json   [tracked]
├── .gitignore                      ignores raw_scripts_TEMP/          [tracked]
├── raw_scripts_TEMP/               117 copyrighted screenplays        [IGNORED]
└── baakhapaa/                   ← PROJECT repo    → origin/codebase
    ├── .claude/skills/             script-rag, script-structure
    ├── baakhapaa-backend/
    ├── baakhapaa-frontend/
    └── *.md                        all project docs
```

The wrapper tracks `baakhapaa` as a **gitlink** (a pointer to one specific
commit of the inner repo), but there is **no `.gitmodules`**. So it behaves
like a submodule without being registered as one.

### What this means in practice

| | Wrapper (`D:\AkxyaRup`) | Project (`D:\AkxyaRup\baakhapaa`) |
|---|---|---|
| Local branch | `main` | `master` |
| Pushes to | `origin/main` | `origin/codebase` |
| Holds | `.claude/` config + gitlink | the entire application |
| You'll edit this | rarely | almost always |

**Nearly all your work is in the inner repo.** `cd` into `baakhapaa/` and
treat it as the project; the wrapper only needs a commit when you want to
record which project commit it points at.

**Never target `main` with project work.** On the remote, `main` is the
wrapper. The app's default branch is **`codebase`**.

### Why `git status` in the wrapper says "modified: baakhapaa (new commits)"

That is not a code change. It means the inner repo has moved ahead of the
commit the wrapper's gitlink points at. It's expected after every inner
commit, and harmless. Update it only when you want the pointer refreshed
(see §3).

---

## 2. The normal working loop

```bash
cd D:\AkxyaRup\baakhapaa
```

1. Make the change.
2. Run both servers and **test in the browser** — this project's convention is
   that nothing is "done" until it's been exercised live in demo mode.
3. Commit one logical change at a time. Never bundle unrelated changes.
4. Push when a coherent chunk is finished.

```bash
git -C D:\AkxyaRup\baakhapaa push origin master:codebase
```

Note the `master:codebase` refspec — local branch, remote branch. A bare
`git push` also works (the branch already tracks `origin/codebase`), but the
explicit form is what to use if you're ever unsure.

### Commit message convention

The existing log is the spec: a concrete one-line summary, then a body that
says **what changed and why**, including what was verified and anything found
along the way. Look at `git log` — messages here carry real information
(measurements, percentages, bugs discovered while verifying). Match that.

---

## 3. Pushing both repos (the full sequence)

Order matters: push the inner repo **first**, so the commit the wrapper's
gitlink points at already exists on the remote.

```bash
git -C D:\AkxyaRup\baakhapaa push origin master:codebase
```

Then, only if you want the wrapper's pointer updated:

```bash
git -C D:\AkxyaRup add baakhapaa
git -C D:\AkxyaRup commit -m "Point wrapper at latest baakhapaa commit"
git -C D:\AkxyaRup push origin main
```

### Authentication

There is no `gh` CLI and no stored token. Git Credential Manager is installed
and configured system-wide (`credential.helper = manager`), so the **first**
push opens a browser window to sign in to GitHub, then caches the credential
in Windows Credential Manager.

**This only works from an interactive terminal.** A non-interactive shell —
including a Claude Code agent session — fails with:

```
fatal: could not read Username for 'https://github.com': terminal prompts disabled
```

That's not a broken repo, it's the sandbox refusing to prompt. Run the push
yourself from a normal terminal. Once the credential is cached, later pushes
in the same environment stop prompting.

Because `gh` isn't installed, **pull requests must be opened in the browser.**

---

## 4. Rules that must not be broken

### Copyright
`raw_scripts_TEMP/` holds 117 copyrighted screenplays and a ~19MB
`knowledge_base.json` of **full script text**. It is gitignored at the wrapper
level. Never commit, push, or publish it.

Watch for the two-file name collision:

| File | Contents | Publish? |
|---|---|---|
| `baakhapaa-backend/knowledge_base.json` (~35 KB) | 29 original craft entries | ✅ this is the app's |
| `raw_scripts_TEMP/knowledge_base.json` (~19 MB) | full copyrighted text | ❌ **never** |

Reading those scripts to learn from is fine. Distributing them is not.

**When adding to the craft library, write original prose.** Every
`worked_example` in the corpus is written from scratch in Baakhapaa's
Kathmandu idiom. That's what keeps the corpus publishable by construction. The
loader's guard (rejecting overlong prose fields) is a backstop, not the
defence.

### Secrets
All keys live in `.env` files, which are gitignored. Never hardcode a key.
`JWT_SECRET` is mandatory — the backend refuses to boot on a missing, short,
or default secret.

### Demo mode is the default
Placeholder `.env` keys → local SQLite + mock Claude + mock DALL-E + mock
Stripe. Embeddings are the exception: **real**, computed locally by fastembed,
no API key needed. Test login: `test@example.com` / `password` (pro tier).

Delete `baakhapaa-backend/baakhapaa_local.db` for a clean slate.

### The deferred-delete quirk
The mock DB's `delete()` is **deliberately** deferred to `execute()` so
`table.delete().eq(...)` matches real Supabase semantics. Reverting it to eager
deletion wipes whole tables in demo mode.

### Windows
- Run uvicorn **without `--reload`** — orphaned processes squat on port 8000.
  Restart manually after backend edits. Kill stragglers:
  `Get-Process python | Stop-Process -Force`
- Backend venv is at `baakhapaa-backend/venv` — use `./venv/Scripts/python`.
- `bcrypt` is pinned to `4.0.1`; newer breaks passlib.

---

## 5. Claude Code setup on another machine (the office)

### What's needed

**Nothing to install beyond Claude Code itself.** The project's Claude
configuration is committed and loads automatically. The setup is: clone,
install the app's own dependencies, open Claude Code at the right directory.

### Step by step

```bash
git clone https://github.com/shubhyeahdav/baakhapaascript.git
cd baakhapaascript
git checkout codebase
```

That gives you the **project** repo directly (the wrapper isn't needed — it
only holds local launch config and the gitignore for the copyrighted scripts,
which you won't have at the office anyway).

Then the standard app setup from `ONBOARDING.md`:

```bash
cd baakhapaa-backend && python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt
cd ../baakhapaa-frontend && npm install
```

Open Claude Code with the repo root as the working directory.

### What loads automatically

| Thing | Where it lives | Loads when |
|---|---|---|
| `CLAUDE.md` | repo root | every session in this repo |
| `script-rag` skill | `.claude/skills/script-rag/` | working on RAG/generation files |
| `script-structure` skill | `.claude/skills/script-structure/` | writing/critiquing any script or beat sheet |

Both skills are **committed to the repo**, so they need no per-machine setup —
cloning is enough. Confirm they registered by running `/skills` (or asking
Claude what skills are available) in a session opened at the repo root.

The skills are directory-scoped to `baakhapaa/`. If you clone the **wrapper**
instead of just the project branch, open Claude Code at `D:\AkxyaRup` and they
still resolve, because the scoping matches the path they sit under.

### What does NOT transfer — set these up per machine

1. **GitHub credentials.** Nothing is committed. First push opens a browser
   sign-in via Git Credential Manager. If GCM isn't installed at the office,
   `git config --global credential.helper manager` after installing Git for
   Windows, or use a PAT.
2. **`.env` files.** Gitignored by design. Without them the app runs in demo
   mode, which is enough for most work. Real keys per `ONBOARDING.md` §3.
3. **The venv.** Not committed; recreate it with the command above.
4. **`raw_scripts_TEMP/`.** Never committed (copyright). The app doesn't need
   it — only `LEARN_SCREENWRITING.md` exercises and the unimplemented
   `SCRIPT_CORPUS_PLAN.md` work reference it.
5. **`.claude/settings.local.json`.** Lives in the wrapper and holds local
   permission allowlists. Personal to the machine; let Claude Code recreate it
   as you approve tools.
6. **`gh` CLI.** Not installed here. Installing it at the office is a genuine
   upgrade — it would let PRs be opened from the terminal instead of the
   browser.

### Optional but recommended at the office

- **Install `gh`** (`winget install GitHub.cli`, then `gh auth login`) — fixes
  both the PR workflow and the push authentication in one step, including for
  agent sessions.
- **A `.claude/launch.json`** for the frontend dev server, so Claude Code can
  start and preview the app. The wrapper's copy points at
  `baakhapaa/baakhapaa-frontend`; if you clone the project branch directly,
  the `--prefix` becomes `baakhapaa-frontend`.

---

## 6. Where to look when something's off

| Symptom | Look at |
|---|---|
| What's the project state right now? | `CLAUDE.md`, then `PROJECT_PLAN.md` §6 |
| What did the last session do? | `HANDOVER.md` |
| What should I work on next? | `PROJECT_PLAN.md` §4 |
| Why did generation pull these patterns? | `script-rag` skill, then `rag.py` |
| How do I structure this scene/short? | `script-structure` skill |
| Is this endpoint's ownership check right? | `AUDIT_REPORT.md`, `auth.py` |
| I'm new to full-stack | `LEARNING_GUIDE.md` |
| I want to learn screenwriting itself | `LEARN_SCREENWRITING.md` |
