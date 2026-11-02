---
paths:
  - "baakhapaa-backend/tests/**"
  - "baakhapaa-backend/conftest.py"
---

# Backend test guards

**A live provider now stops the run rather than being neutralised by name.**
`conftest.py` asserts at session start that `script_engine.PROVIDER` is
`mock`, `storyboard_engine.MOCK_AI` is true and `database.use_mock` is true,
and calls `pytest.exit` if any is not. The env pinning below it still does the
work; this is the net that catches the next provider nobody remembered to pin
— which is exactly how the 75-minute hang and the production-database run both
happened. `tests/test_live_provider_guard.py` forces each condition. If a
future you is tempted to delete the check because it is in the way: it is the
thing that noticed.

**The historical failure, kept because it explains the guard:** Until 2026-09-10 `conftest.py` neutralised `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY` and `GROQ_API_KEY` but not `LLM_PROVIDER` / `LLM_API_KEY`,
which the OpenAI-compatible transport reads — so with a real TokenRouter key
in `.env` every AI test made a live billed call to a reasoning model that
returns nothing. The suite did not fail, it hung: 75 minutes, no output.

"Every component and page has a test" was true on 2026-08-26 and stopped
being true as components were extracted afterwards — `AssistPanel` had none
until 2026-09-10. Treat it as a thing to check, not a thing that holds.
