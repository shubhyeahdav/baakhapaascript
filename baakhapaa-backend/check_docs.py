"""Do the documents still describe this repository?

    ./venv/Scripts/python check_docs.py          # report drift, exit 1 if any
    ./venv/Scripts/python check_docs.py --fix    # rewrite the numbers in place

WHY THIS EXISTS
---------------
On 2026-09-16 four documents were wrong at once, and every error was the same
kind:

    MONTH_3_TASKS.md   said 117 of 200        actually 143
    CLAUDE.md          said 907 tests         actually 1083
    CLAUDE.md          said 39 craft entries  actually 45
    ROADMAP.md         4 carried-forward      3 already done

The knowledge in this repository is not stale — the commit messages and
docstrings are unusually good. What rots is the *index* to it, and it rots for
one reason: these are DERIVED numbers that somebody typed. A number a script
can count should never be transcribed, because transcription is a copy that
starts going out of date the moment it is made, with nothing watching it.

So this counts them, and `--fix` writes them. `tests/test_docs_are_current.py`
runs the cheap half on every suite run; the expensive half — collecting both
test suites — belongs in CI, which is why this is a script and not only a test.

It is READ ONLY without `--fix`, and `--fix` touches nothing but the specific
numbers below.
"""
import io
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(ROOT)
FRONTEND = os.path.join(REPO, "baakhapaa-frontend")
CLAUDE_MD = os.path.join(REPO, "CLAUDE.md")


# --- counting ---------------------------------------------------------------

def backend_tests() -> tuple:
    """(tests, files), from pytest's own collection.

    Collected, not `def test_` counted: 1083 against 992 on 2026-09-16, and the
    difference is every parametrised case. A guard that counts the wrong thing
    is worse than none, because it fails for reasons nobody can act on.
    """
    out = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q"],
        cwd=ROOT, capture_output=True, text=True, timeout=300,
        encoding="utf-8", errors="replace",
    ).stdout
    rows = re.findall(r"^tests/\S+: (\d+)$", out, re.M)
    return sum(int(n) for n in rows), len(rows)


def frontend_tests():
    """(tests, files) from vitest's own listing, or None where node is absent.

    None rather than an exception: this runs in a Python-only CI job as well as
    on a developer machine, and a checker that refuses to report the four
    numbers it CAN count because it could not reach the fifth is a checker
    people switch off. The claims it could not count are simply left unchecked,
    and `main` says so.
    """
    try:
        result = subprocess.run(
            ["npx", "vitest", "list"],
            cwd=FRONTEND, capture_output=True, text=True, timeout=300, shell=True,
            encoding="utf-8", errors="replace",
        )
    except (OSError, subprocess.SubprocessError):
        return None
    out = result.stdout or ""
    lines = [ln for ln in out.splitlines() if " > " in ln]
    if not lines:
        return None
    files = {ln.split(" > ")[0].strip() for ln in lines}
    return len(lines), len(files)


def craft_entries() -> int:
    with io.open(os.path.join(ROOT, "knowledge_base.json"), encoding="utf-8") as fh:
        return len(json.load(fh))


# --- the claims -------------------------------------------------------------
#
# Each is (label, regex with ONE capturing group, how to get the true value).
# The regex has to be tight enough that `--fix` cannot rewrite prose that
# merely contains a number.

CLAIMS = [
    ("backend tests and files",
     r"(Backend tests: \*\*)(\d+)( across )(\d+)( files)",
     lambda c: (c["backend_tests"], c["backend_files"])),
    ("frontend tests and files",
     r"(Frontend tests: \*\*)(\d+)( across )(\d+)( files)",
     lambda c: (c["frontend_tests"], c["frontend_files"])),
    ("craft entries",
     r"(`knowledge_base\.json` \(\*\*)(\d+)( craft entries)",
     lambda c: (c["craft"],)),
]


def counted(cheap_only: bool = False) -> dict:
    c = {"craft": craft_entries()}
    if cheap_only:
        return c
    c["backend_tests"], c["backend_files"] = backend_tests()
    front = frontend_tests()
    if front:
        c["frontend_tests"], c["frontend_files"] = front
    return c


def _numeric_groups(match) -> list:
    """Which capture groups of a claim hold its numbers.

    Every claim is written as alternating literal and number groups, so this
    needs no per-claim configuration -- adding a claim means adding one line to
    CLAIMS and nothing else.
    """
    return [i for i, g in enumerate(match.groups(), start=1) if g and g.isdigit()]


def drift(text: str, counts: dict) -> list:
    """Every claim whose numbers disagree with the count.

    A claim this file can no longer FIND is reported too. A document that
    quietly stopped making a claim is not thereby correct -- it is unwatched,
    which is the state that produced this script.
    """
    out = []
    for label, pattern, pick in CLAIMS:
        try:
            want = pick(counts)
        except KeyError:
            continue  # not counted in this mode
        m = re.search(pattern, text)
        if not m:
            out.append((label, None, want))
            continue
        said = tuple(int(m.group(i)) for i in _numeric_groups(m))
        if said != tuple(want):
            out.append((label, said, tuple(want)))
    return out


def apply_fix(text: str, counts: dict) -> str:
    for _label, pattern, pick in CLAIMS:
        try:
            want = list(pick(counts))
        except KeyError:
            continue

        def rewrite(m, want=want):
            parts = list(m.groups())
            for slot, value in zip(_numeric_groups(m), want, strict=False):
                parts[slot - 1] = str(value)
            return "".join(parts)

        text = re.sub(pattern, rewrite, text, count=1)
    return text


def main() -> int:
    fix = "--fix" in sys.argv
    counts = counted()
    text = io.open(CLAUDE_MD, encoding="utf-8").read()
    problems = drift(text, counts)

    print("Counted from the working tree:\n")
    print(f"  backend    {counts['backend_tests']:>5} tests across "
          f"{counts['backend_files']} files")
    if "frontend_tests" in counts:
        print(f"  frontend   {counts['frontend_tests']:>5} tests across "
              f"{counts['frontend_files']} files")
    else:
        print("  frontend       -- not counted (vitest unavailable here)")
    print(f"  corpus     {counts['craft']:>5} craft entries\n")

    if not problems:
        print("CLAUDE.md matches the repository.")
        return 0

    for label, said, want in problems:
        if said is None:
            print(f"  [GONE] CLAUDE.md no longer states the {label}")
        else:
            print(f"  [DRIFT] {label}: says {said}, is {want}")

    if fix:
        io.open(CLAUDE_MD, "w", encoding="utf-8", newline="\n").write(
            apply_fix(text, counts))
        print("\nRewritten. Read the diff before committing it.")
        return 0

    print("\nRun with --fix to rewrite them, then commit the diff.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
