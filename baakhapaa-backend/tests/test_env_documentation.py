"""Every setting the application reads must be documented in `.env.example`.

This is a deploy-time guard, not a style rule. `.env.example` is the only list of
what this service can be configured with — `DEPLOYMENT.md` sends whoever is
setting up Railway straight to it. A variable that exists in code but not in that
file is a knob nobody deploying the app can discover, and the failure mode is
quiet: the default is used, everything appears to work, and the one person who
needed to change it never learns they could.

Three variables were in exactly that state when this test was written —
`ACCESS_LOG_WINDOW_SECONDS`, `KHALTI_TIMEOUT` and `ESEWA_TIMEOUT`, all three read
at import time with a hardcoded fallback. Documenting them was a one-off fix;
this test is what stops the fourth.

The exception list is empty on purpose. Thirty-eight variables are read and
thirty-eight are documented, so there is nothing to grandfather in — which is the
only version of this test worth having, because a list of accepted exceptions is
where a rule like this goes to die.
"""
import pathlib
import re

ENV_EXAMPLE = pathlib.Path(__file__).resolve().parent.parent / ".env.example"
BACKEND = ENV_EXAMPLE.parent

SKIP_DIRS = {"venv", "__pycache__", "tests", "build", ".git"}

# Read by the platform rather than configured by us. `PORT` is supplied by
# Railway; documenting it would imply the operator gets to choose it.
NOT_OURS_TO_DOCUMENT = {"PORT"}

_READS = re.compile(
    r"""os\.getenv\(\s*["']([A-Z0-9_]+)["']"""
    r"""|os\.environ\.get\(\s*["']([A-Z0-9_]+)["']"""
    r"""|os\.environ\[\s*["']([A-Z0-9_]+)["']"""
)


def _settings_read_by_the_app() -> set:
    found = set()
    for path in BACKEND.rglob("*.py"):
        if set(path.parts) & SKIP_DIRS:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in _READS.finditer(text):
            found.add(next(g for g in match.groups() if g))
    return found - NOT_OURS_TO_DOCUMENT


def _documented() -> str:
    return ENV_EXAMPLE.read_text(encoding="utf-8")


def test_every_setting_the_app_reads_is_documented():
    """Fails with the missing names, so the message is the fix."""
    documented = _documented()
    missing = sorted(n for n in _settings_read_by_the_app() if n not in documented)

    assert not missing, (
        "these are read from the environment but absent from .env.example: "
        + ", ".join(missing)
    )


def test_the_app_reads_a_plausible_number_of_settings():
    """A canary on the scanner itself. If a refactor moved configuration behind a
    helper, the regex above would quietly match nothing and the test above would
    pass by finding no variables at all."""
    assert len(_settings_read_by_the_app()) > 25


def test_the_three_previously_undocumented_timeouts_are_documented():
    """Named explicitly because these are the ones that were missing, and because
    each is read at import time — a deployment that sets them after start-up gets
    the default and no warning."""
    documented = _documented()
    for name in ("ACCESS_LOG_WINDOW_SECONDS", "KHALTI_TIMEOUT", "ESEWA_TIMEOUT"):
        assert name in documented
