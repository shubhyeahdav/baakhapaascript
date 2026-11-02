---
paths:
  - "baakhapaa-backend/**"
---

## Security (see AUDIT_REPORT.md; re-checked in PROJECT_PLAN.md §3 + §6)
A full audit was done. All script-related endpoints enforce ownership via
`require_script_access()` in `auth.py` (returns 404 to avoid id probing) —
re-verified 2026-07-11. Project/frame updates use field whitelists.
**Fixed:** `JWT_SECRET` is now required — the backend refuses to boot on a
missing/short/default secret (`3b66222`).
**Also fixed since the audit** (this list read as open for a while after it
wasn't): login/register rate limiting (`rate_limit.py`); a server-side password
policy (`models.password_policy_errors`, enforced in `/auth/register`); the mock
test user now requires `DEMO_SEED=true`; Word/package export and storyboard
generation are gated by `require_tier`; login equalises timing between an unknown
email and a wrong password.
**All three former pre-deploy items are now enforced rather than documented**
(2026-08-20): `APP_ENV=production` makes `deploy_checks.py` refuse the boot on an
unset `CORS_ORIGINS`, a `DEMO_SEED=true` known credential, a SQLite fallback
database, or a Devanagari font resolving only to Nirmala; and `Procfile` /
`railway.json` both carry `--proxy-headers --forwarded-allow-ips='*'`. See
`DEPLOYMENT.md`. What remains is running it — none of this has been exercised
against a real host.
