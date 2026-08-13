# Building Baakhapaa with Claude: what the evidence says

Proposal §4.4 rests the 12-week timeline on AI-assisted coding. That is a reasonable bet,
but the published data from 2025 and 2026 shows the bet pays off only under specific
conditions. This document collects what the research actually found and turns it into a
working method for Months 2 and 3.

## 1. The honest picture

Two findings matter and they point in opposite directions.

**AI assistance is not automatically faster.** METR ran a randomized controlled trial in
2025 with 16 experienced developers across 246 tasks in mature repositories. Developers
using AI tools were **19% slower**. They believed they had been 20% faster. That gap
between felt speed and measured speed is the finding to internalize. METR now labels the
result historical and notes it may not reflect current tools, but the mechanism it exposed
has not gone away: time saved generating code is spent reviewing, correcting, and
integrating it.

**AI-generated code carries more defects.** Veracode's 2026 GenAI Code Security Report
found roughly 44% of AI code-generation tasks introduced a risky vulnerability. An
independent 2026 study of 534 samples across six models found 25.1% contained a confirmed
OWASP Top 10 vulnerability. Other 2026 analyses put AI-generated code at 1.88x more likely
to introduce a vulnerability than human-written code, and tracked CVEs directly traceable
to AI-generated code rising from 6 in January 2026 to 35 in March.

The conclusion is not "don't use it." It is that the productivity comes from the process
around the generation, not the generation itself. Teams that do well allocate real time to
consolidation: reported figures are 15% to 20% of each sprint spent collapsing the
duplication and shallow abstractions that AI-assisted work produces.

## 2. The single highest-leverage change: give Claude something to verify against

Anthropic's own best-practices guidance puts this first, and it is the practice with the
clearest link to output quality. The reasoning:

> Claude stops when the work looks done. Without a check it can run, "looks done" is the
> only signal available, and you become the verification loop.

**This project currently has zero automated tests.** No `test_*.py`, no `*.test.jsx`, no
pytest in `requirements.txt`, and no test script in `package.json`. Every correctness
check in Months 1 has been you or me looking at the screen. That is the main structural
weakness going into the harder half of the build, and it is worth fixing before Week 5
rather than after Week 12.

You do not need full coverage. You need a signal an agent can read. Start here:

```bash
cd baakhapaa-backend && ./venv/Scripts/python -m pytest -q
```

Roughly twenty tests would cover the load-bearing paths: register and login, the 404 on
another user's script, the 33/33/34 act split, `add-scene` persistence, tier gating on the
AI routes, and the export endpoints returning valid bytes. Once `pytest` exists, the
instruction changes from "add tier limits" to "add tier limits, then run pytest and fix
what fails," and the loop closes without you in it.

The same applies to the frontend. `react-scripts test` is already available; only the
`package.json` script entry is missing.

## 3. The workflow: explore, plan, implement, verify

Every credible source converges on the same four phases, and the failure mode they all
name is jumping straight to code and solving the wrong problem.

**Explore.** Ask questions before requesting changes. "How does the storyboard engine
assign shot types, and where would per-frame camera notes need to be stored?" costs one
turn and prevents a wrong implementation.

**Plan.** For anything touching more than one file, get a written plan first and read it.
Skip this for a typo or a log line: planning has overhead and the guidance is explicit that
if you could describe the diff in one sentence, don't plan it.

**Implement.** Reference concrete files and existing patterns. Compare these two:

- "add tier limits"
- "enforce free-tier limits in `projects.py`. Follow the pattern in `auth.py`'s
  `require_paid_tier`. Free users get 1 project; return 402 with a clear message. Write a
  test for both the allowed and blocked case, then run pytest."

The second produces usable work; the first produces something you then have to correct.

**Verify.** Ask for evidence, not assurance: the test output, the command run and what it
returned, a screenshot. Reviewing evidence is faster than re-running the check yourself.

A second technique worth using for Month 2 features: **review in a fresh session.** A model
reviewing code it just wrote is biased toward it. Opening a separate session that sees only
the diff produces a genuinely independent read. The counterweight, which the guidance also
names: a reviewer asked to find gaps will find some even when the work is sound, so scope
it to correctness rather than style or it will push you toward over-engineering.

## 4. Context is the constraint

Performance degrades as the context window fills. Most of the practical advice follows from
that one fact.

- **Clear between unrelated tasks.** A session that drifts from storyboards to auth to
  exports carries all three in context and does all three worse.
- **After two failed corrections, start over.** A polluted context with failed approaches
  is worse than a clean session with a better prompt that incorporates what you learned.
- **Delegate research.** Investigating a question across many files fills your context with
  file contents. A subagent reads them in a separate window and reports back a summary.

**Your `CLAUDE.md` is doing real work and needs pruning.** It is currently about 100 lines
and includes a session log from July, a design-sync note about a blocked experiment, and a
"current state" list that has already drifted (it says tier limits are enforced nowhere;
`require_paid_tier` now gates the AI routes). The guidance is blunt about the cost: a
bloated file means important rules get lost and ignored. The test for each line is whether
removing it would cause a mistake. The Windows gotchas section passes that test easily. The
session log does not.

The two skills in `.claude/skills/` (`script-rag`, `script-structure`) are the right pattern
for everything that only matters sometimes: they load when relevant instead of sitting in
every conversation.

## 5. Spec-driven development for Months 2 and 3

The 2026 consensus response to vibe coding's failure mode is to treat the specification as
the source of truth and the code as the generated artifact. GitHub reports teams using
Spec Kit ship features with roughly an order of magnitude fewer "regenerate from scratch"
cycles than ad-hoc prompting. AWS documents cases where 40-hour features shipped in under 8
hours of human time when authored as specs first.

You already have the raw material: [PRD.md](PRD.md), [TRD.md](TRD.md), and the blueprint's
functional requirements table. What is missing is the per-feature layer. Before building
Week 7's collaboration module, write a short spec that names the files and interfaces
involved, states what is out of scope, and ends with an end-to-end check that proves the
feature works. Then start a fresh session to implement it.

A useful trick for this: ask to be interviewed before writing the spec. Questions surface
edge cases and tradeoffs you have not considered, which is where most rework originates.

## 6. Security, specifically for this project

This matters more here than in a typical side project. Baakhapaa handles credentials,
personal data, and payments, and it is intended for public launch with users in Nepal. The
vulnerability rates above are population statistics, not a prediction about your code, but
they set the prior.

Three things follow:

**The audit was necessary, not optional.** [AUDIT_REPORT.md](AUDIT_REPORT.md) found and
fixed real issues: ownership checks, mass-assignment whitelists, the JWT secret. That the
backend now refuses to boot without a strong `JWT_SECRET` is exactly the right shape of
fix, because it cannot be forgotten.

**Its open items are launch blockers.** Login rate limiting, the compiled-in mock test user,
and CORS scoped to the production domain. All three are in `AUDIT_REPORT.md` and none are
done.

**Re-audit before launch, not once.** The Month 3 code will be written the same way the
Month 1 code was. One audit at Week 6 does not cover Weeks 7 through 12. A `/security-review`
pass on each substantial diff costs minutes.

Prompt injection deserves specific thought given what this product does: user-supplied
scene briefs flow into prompts sent to Claude. A brief containing instructions rather than
story content is a plausible input. Treat everything from the user as data, and keep the
system prompt as the only source of instructions.

## 7. What to actually do differently in Month 2

1. Add pytest and roughly twenty backend tests before Week 5 work begins. Add the `test`
   script to `package.json`.
2. Prune `CLAUDE.md`: cut the session log and design-sync note, correct the tier-enforcement
   line, keep the Windows gotchas and conventions.
3. Write a one-page spec per feature before building it. Implement in a fresh session.
4. Ask for evidence on every completion claim: test output, command results, screenshots.
5. Review substantial diffs in a separate session, scoped to correctness.
6. Budget one day per fortnight for consolidation. The duplication is real and compounds.
7. Re-run the security review on each module before Month 3 handover, not once at the end.

The proposal's claim that AI-assisted coding makes this timeline achievable for one
developer is defensible. The evidence just says it is contingent on the discipline around
the generation. Month 1 shipped more than its scope, which suggests the approach is working.
Adding a verification loop is what keeps that true as the codebase grows past the point
where one person can hold it all in their head.

## Sources

- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [METR randomized trial: experienced developers 19% slower with AI tools](https://letsdatascience.com/blog/developers-thought-ai-made-them-faster-the-data-said-otherwise)
- [2026 GenAI Code Security Report, Veracode](https://www.veracode.com/blog/2026-genai-code-security-report-ai-risk/)
- [Vibe Coding's Security Debt: The AI-Generated CVE Surge, Cloud Security Alliance](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/)
- [AI Coding Security Vulnerability Statistics 2026](https://sqmagazine.co.uk/ai-coding-security-vulnerability-statistics/)
- [Spec-Driven Development in 2026: What It Is, the Tooling, and How Teams Actually Use It](https://dev.to/krlz/spec-driven-development-in-2026-what-it-is-the-tooling-and-how-teams-actually-use-it-2fk2)
- [Spec-Driven Development: A Spec-First Approach to AI-Native Engineering, Microsoft](https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/)
- [Vibe Coding Trends 2026: Adoption, Productivity, and Code Quality Data, Keyhole Software](https://keyholesoftware.com/vibe-coding-trends-2026/)
- [Vibe Coding Best Practices: Avoid the Doom Loop with Planning and Code Reviews, Product Talk](https://www.producttalk.org/vibe-coding-best-practices/)
- [Security Degradation in Iterative AI Code Generation (arXiv)](https://arxiv.org/pdf/2506.11022)
