# After route-level code splitting — 2026-09-04

Same build, same machine, immediately after the change. Compare against
`baseline-2026-09-04.md`.

## What each route now downloads

| Route | Chunks | Gzipped | Was | Change |
|---|---|---|---|---|
| `/login` | shared + LoginPage | **84.9 kB** | 146.3 kB | **-42%** |
| `/dashboard` | shared + Dashboard + TopNav | **88.2 kB** | 146.3 kB | -40% |
| `/terms` | shared + LegalPage | **90.6 kB** | 146.3 kB | -38% |
| editor | shared + ScriptEditor + deps | **~118 kB** | 146.3 kB | -19% |

The shared chunk is 246 kB raw / **83.3 kB gzipped** and holds only what renders
on every route: React, the router, the auth and language providers, the error
boundary, the command palette.

## The chunks

    index          246.13 kB   83.32 kB gz   shared
    ScriptEditor   115.80 kB   33.48 kB gz   the editor, on its own
    LegalPage       17.58 kB    7.27 kB gz   Terms and Privacy markdown
    NewProject      10.49 kB    3.31 kB gz
    Dashboard        8.63 kB    2.98 kB gz
    Onboarding       8.60 kB    3.10 kB gz
    StoryboardView   8.47 kB    2.89 kB gz
    LearnPage        7.78 kB    2.78 kB gz
    ... eleven more, none above 8 kB

`ScriptEditor` being 116 kB of the old 477 kB is the single clearest number
here: a quarter of what every visitor downloaded was one page most of them had
not reached yet.

## Verified, not assumed

- `build/index.html` loads the shared chunk and the stylesheet. **No
  `modulepreload` of lazy chunks** — the browser fetches a page's chunk when the
  route renders, not before.
- `LoginPage-*.js` contains no reference to `ScriptEditor-*.js`.
- The two references to the editor chunk inside the shared chunk are the Vite
  dependency manifest and the `import()` call itself, which are URLs rather than
  downloads.

## Pinned

`App.test.jsx` now asserts that every non-redirect route is a `React.lazy` type.
The win is one careless `import Dashboard from "./pages/Dashboard"` away from
being undone, and nothing would fail if it were — the app would work perfectly
and simply be slow again for everyone on a slow connection.

## Not measured

Real first-contentful-paint on a throttled 3G connection. The browser tooling
available here does not throttle reliably, and a fabricated number is worse than
none. Bytes-over-the-wire is the honest proxy and it is exact; the remaining
question is only how those bytes translate to seconds on a real Nepali
connection, which is a question for the device session.
