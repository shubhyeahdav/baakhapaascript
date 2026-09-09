"""Does PostgREST survive the editor opening?

The editor fires eight requests at once when a script opens - the script,
versions, comments, the access log, the lint, the benchmark - and roughly one in
eight came back 500 with `httpx.RemoteProtocolError: Server disconnected`
underneath it. supabase-py builds its httpx client with `http2=True`, and many
streams multiplexed onto one h2 connection all die together when the server
closes it.

Measured rather than assumed, because two likelier explanations were wrong:
a 30-request burst down one connection never failed, and idle gaps of 30 to 120
seconds never failed either - httpx already expires a kept-alive connection
after five seconds. Only concurrency reproduced it.

    HTTP/2 (supabase-py default)   8 failures / 64
    HTTP/1.1 (database.py)         0 failures / 96

The suite cannot cover this: `tests/conftest.py` sets placeholder Supabase
credentials before the app is imported, precisely so tests never connect out, so
the real-client branch of `database.py` is never executed there. This script is
that branch's only check. Run it against a backend that is already up, with real
credentials in `.env`, after anything that touches the client construction.

    ./venv/Scripts/python supabase_concurrency_check.py 12

Exits non-zero if any request failed.
"""
import concurrent.futures as cf
import json
import sys
import urllib.request

API = "http://localhost:8000"
EMAIL, PASSWORD = "probe-1@example.com", "Aud1t!Pass!2026"
ROUNDS, WIDTH = int(sys.argv[1]) if len(sys.argv) > 1 else 8, 8


def call(path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method="POST" if data else "GET")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:                                    # noqa: BLE001
        return 0, str(e).encode()


status, raw = call("/auth/login", body={"email": EMAIL, "password": PASSWORD})
if status != 200:
    print(f"login failed ({status}) — the probe account may have been purged")
    raise SystemExit(1)
token = json.loads(raw)["token"]

projects = json.loads(call("/projects/", token)[1])
if not projects:
    print("no projects on the probe account")
    raise SystemExit(1)
pid = projects[0]["id"]
script = json.loads(call(f"/scripts/project/{pid}", token)[1])
sid = script["id"]

# What the editor actually asks for when a script opens, all at once.
FANOUT = [
    ("/projects/", None),
    (f"/scripts/{sid}", None),
    (f"/versions/{sid}", None),
    (f"/collaboration/comments/{sid}", None),
    (f"/scripts/{sid}/access", None),
    ("/scripts/lint", {"scene_text": "INT. PASAL - DAY\n\nShe waits.", "script_id": sid}),
    ("/scripts/benchmark", {"content": "INT. PASAL - DAY\n\nShe waits.", "script_id": sid}),
    ("/auth/me", None),
]

failures, total = [], 0
for _ in range(ROUNDS):
    with cf.ThreadPoolExecutor(max_workers=WIDTH) as pool:
        futures = {pool.submit(call, p, token, b): p for p, b in FANOUT}
        for fut in cf.as_completed(futures):
            code, payload = fut.result()
            total += 1
            if code >= 500 or code == 0:
                failures.append((futures[fut], code, payload[:70]))

print(f"{len(failures)}/{total} requests failed across {ROUNDS} concurrent rounds")
for path, code, payload in failures[:10]:
    print(f"  {code} {path} :: {payload!r}")
raise SystemExit(1 if failures else 0)
