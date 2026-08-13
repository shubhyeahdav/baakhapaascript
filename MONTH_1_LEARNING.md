# Month 1 learning modules

Proposal §8 pairs each build week with a learning module. This guide covers those four,
using this repository as the worked example. Every file reference points at code you can
open and run.

[LEARNING_GUIDE.md](LEARNING_GUIDE.md) is the orientation doc: mental model, folder map,
trace-one-feature. Read that first if the three-tier idea (browser, server, database) is
new. This guide goes a level deeper on the four specific topics Month 1 names.

## Module 0: get it running

Both servers are configured in [.claude/launch.json](.claude/launch.json). Manually:

```bash
cd baakhapaa-backend && ./venv/Scripts/python -m uvicorn main:app --port 8000
```

```bash
cd baakhapaa-frontend && npm start
```

The backend needs `JWT_SECRET` in `baakhapaa-backend/.env` or it refuses to boot. Leave
the API keys unset: absent keys put the system in demo mode (local SQLite, mock AI), which
is the right environment for learning because nothing costs money.

Open http://localhost:8000/docs. That page is generated from the code and lets you call
every endpoint by hand. It is the single most useful tool for learning this backend.

## Module 1 (Week 1): FastAPI and project architecture

**The idea.** A web framework turns HTTP requests into function calls. FastAPI does it
with type hints: you declare what a request should look like, and it validates, parses,
and documents it for you.

**In this repo.** [main.py](baakhapaa-backend/main.py) is the front door. It creates the
app, adds CORS, and mounts eight routers. Each router is one topic:
[auth.py](baakhapaa-backend/auth.py), [projects.py](baakhapaa-backend/projects.py),
[scripts.py](baakhapaa-backend/scripts.py), and so on. Thirty-four routes total.

Three patterns repeat everywhere, and once you see them the rest of the backend reads
easily:

1. **Pydantic models as contracts.** [models.py](baakhapaa-backend/models.py) defines the
   shape of every request body. `AddSceneRequest` at line 68 says a scene needs a
   `script_id` and `title`, and that `act_number` defaults to 1. Send a request missing
   `title` and FastAPI rejects it before your code runs.

2. **Dependency injection for auth.** Look at any protected route:
   `user_id: str = Depends(get_current_user)`. FastAPI calls `get_current_user`
   ([auth.py:33](baakhapaa-backend/auth.py)) first, which reads the JWT from the
   Authorization header and returns the user id, or raises 401. The route body never
   thinks about tokens.

3. **Ownership checks return 404, not 403.** `require_script_access`
   ([auth.py:66](baakhapaa-backend/auth.py)) returns 404 when a script belongs to someone
   else. A 403 would confirm the id exists, letting an attacker map the database by
   probing ids. This is the audit fix described in
   [AUDIT_REPORT.md](AUDIT_REPORT.md).

**Exercises.**
- In `/docs`, register two users. As user A, create a project. As user B, try to open A's
  script id. Predict the status code before you press execute.
- Add a field to `ProjectCreate` in `models.py`, then call `POST /projects/` without it.
  Read the validation error carefully: that message is generated from your type hint.
- Trace `POST /scripts/add-scene` from route to database: `scripts.py` → `database.py`.
  Count how many places check that you own the script.

## Module 2 (Week 2): React components and state

**The idea.** React re-renders the screen whenever state changes. You do not update the
DOM; you update a variable, and React works out what changed.

**In this repo.** 22 components and pages under
[baakhapaa-frontend/src](baakhapaa-frontend/src). Start with three files, in this order:

1. **[AuthContext.jsx](baakhapaa-frontend/src/context/AuthContext.jsx)** is the smallest
   complete example of every hook. `useState` holds the user. `useEffect` runs once on
   mount to check for a saved token. Context makes the result available app-wide without
   passing props through every layer.

2. **[api.js](baakhapaa-frontend/src/services/api.js)** centralises every backend call.
   The axios interceptor attaches the JWT to outgoing requests, which is why no component
   ever handles a token directly.

3. **[ScriptEditor.jsx](baakhapaa-frontend/src/pages/ScriptEditor.jsx)** is the real
   thing: roughly a dozen pieces of state, `useRef` for direct textarea access (React
   cannot set a cursor position through state), and `useCallback` to stop functions being
   rebuilt on every render.

**A quirk worth understanding.** The route is `/projects/:id/editor`, but that `:id` is a
**script** id, not a project id. [Dashboard.jsx:107](baakhapaa-frontend/src/pages/Dashboard.jsx)
calls `scripts.getByProject(projectId)` first, then navigates with the returned script id.
Navigate with a project id and you get "Script not found". Confusing names like this are
normal in real code, and reading the call site is how you resolve them.

**Exercises.**
- Change the "Welcome back" heading in `Dashboard.jsx`. Save. The page reloads itself.
- Add a `console.log` inside the `useEffect` in `AuthContext.jsx`. Reload, then navigate
  between pages. Note how often it fires and work out why.
- Break something deliberately: remove the interceptor from `api.js` and watch every
  protected request start failing with 401.

## Module 3 (Week 3): Claude API and prompt engineering

**The idea.** You send a list of messages and a system prompt; the model returns text. The
craft is in what you put in the system prompt and how you constrain the output.

**In this repo.** [script_engine.py](baakhapaa-backend/script_engine.py) holds every AI
call. `_call_claude` at line 89 is the whole API surface:

```python
message = client.messages.create(
    model=MODEL,
    max_tokens=max_tokens,
    system=system_prompt,
    messages=[{"role": "user", "content": user_prompt}],
)
return message.content[0].text
```

Four things to notice:

**The system prompt carries the voice.** `BAAKHAPAA_STYLE` (line 21) describes characters,
dialogue register, and themes. It is sent on every call, which is what keeps generated
scenes sounding like Baakhapaa rather than generic screenplay English. Prompt engineering
is mostly this: writing the stable instructions once, well.

**`content[0]` is an assumption.** The response is a list of blocks. Indexing `[0]`
assumes the first block is text. It works today; it breaks the moment you enable thinking,
because a thinking block comes first. The safe pattern is to filter by type:

```python
text = next(b.text for b in message.content if b.type == "text")
```

**Failures become 503, not stack traces.** `_call_claude` wraps the call and raises
`RuntimeError`; the route turns that into `HTTPException(503)`. This is the convention in
[CLAUDE.md](CLAUDE.md), and it exists because AI providers fail regularly and callers need
a clean error.

**JSON is requested by asking nicely.** `generate_structure` prompts for JSON and parses
the reply. That works most of the time and fails when the model adds a sentence before the
brace. The current API can guarantee the shape instead, using `output_config`:

```python
response = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=3000,
    output_config={"format": {"type": "json_schema", "schema": ACT_SCHEMA}},
    messages=[{"role": "user", "content": prompt}],
)
```

That is a genuine upgrade to make when real keys are configured.

**Two constraints specific to this model.** `MODEL = "claude-sonnet-5"` (line 17). On that
model, setting `temperature` or `top_p` to a non-default value is rejected with a 400, so
steer tone through the prompt rather than sampling parameters. Prompt caching also will not
engage here: the cacheable minimum is 1024 tokens and `BAAKHAPAA_STYLE` is roughly 170, so
there is nothing to cache until the system prompt grows.

**Exercises.**
- Read `improve_scene` and `suggest_continuations`. Both call the same `_call_claude`. The
  only difference is the prompt. That is the lesson.
- Rewrite `BAAKHAPAA_STYLE` to describe a different register, restart the backend, and
  generate a scene in demo mode. Demo mode returns fixed text, so to see prompt changes you
  need a real key: read `_demo_structure` to understand what you are actually seeing.
- Change `content[0].text` to the type-filtered version above. Nothing breaks, and the code
  is now correct for a case it was not handling.

## Module 4 (Week 4): orchestration, and what this project does instead

Proposal §6 lists LangChain as the orchestration framework, and §8 makes it Week 4's
learning module. **There is no LangChain in this codebase.** `requirements.txt` does not
include it and no module imports it. The multi-step work is written directly in Python.

This is worth understanding rather than treating as a gap, because the thing LangChain
would have provided is visible in `generate_structure`
([script_engine.py:153](baakhapaa-backend/script_engine.py)):

1. Embed the request and retrieve similar story patterns (`retrieve_relevant_patterns`)
2. Format those patterns into prompt text (`format_patterns_for_prompt`)
3. Build the full prompt and call Claude
4. Parse the JSON and persist it

That is a chain. An orchestration framework gives you a vocabulary for describing it, plus
retries, tracing, and swappable components. Written by hand it is about forty lines with no
extra dependency, which for a four-step pipeline is a reasonable trade. When you need
branching, tool loops, or an agent that decides its own next step, the framework starts
earning its cost.

**What to learn here instead.** Read [rag.py](baakhapaa-backend/rag.py) end to end. It is
short and it teaches retrieval properly:

- Text becomes a 384-dimension vector (`embed_texts`), computed locally with fastembed, so
  no API key and no per-call cost.
- Similarity is cosine distance between vectors (`_cosine`, line 45), which is about six
  lines of arithmetic.
- `retrieve_relevant_patterns` embeds the query, scores all 15 stored patterns, and returns
  the top 3.
- The docstring explains why it ranks in Python rather than in the database: at this size,
  exact ranking is simpler than a vector index. Past roughly 500 entries, the pgvector
  migration takes over.

Semantic matching is the point. A "sports underdog" brief can retrieve a boxing drama's
structure because the two are close in vector space, even though they share no genre tag.
Tag matching cannot do that.

**Exercises.**
- Add an entry to [knowledge_base.json](baakhapaa-backend/knowledge_base.json) and run
  `load_knowledge_base.py`. Generate a structure whose theme matches it and see whether it
  gets retrieved.
- Print the cosine scores in `retrieve_relevant_patterns`. Look at how close the top three
  are. If they are nearly identical, retrieval is not discriminating and the library needs
  more variety.
- Call `retrieve_relevant_patterns` with a genre absent from the library. Something still
  comes back, because cosine similarity always ranks. Deciding when a match is too weak to
  use is a design question the current code does not answer.

## What Month 1 does not cover

Named here so the boundary is clear: real Supabase and Postgres (all work so far is
SQLite), deployment to Vercel and Railway, live-cursor collaboration, and Devanagari font
handling in PDF export. The last one is a concrete, self-contained first task if you want
one: [export_service.py](baakhapaa-backend/export_service.py) uses ReportLab with Courier,
which has no Devanagari glyphs, so Nepali dialogue currently exports as blank boxes.
