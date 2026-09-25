/**
 * Start the whole website with one command.
 *
 * `.claude/launch.json` used to carry eight configurations, of which two had to
 * be started in the right order before anything was viewable — the site is two
 * processes and the picker only ever runs one. This is the missing third thing:
 * a parent that owns both, so "start the website" is a single choice.
 *
 * Backend on 8000, frontend on 3000. The frontend's API client already defaults
 * to http://localhost:8000, so no VITE_API_URL is needed here; setting one
 * would bake a wrong value into a later production build.
 *
 * DATABASE: this reads baakhapaa-backend/.env exactly as `uvicorn main:app`
 * always did, which on this machine means the REAL Supabase — writes land in
 * production Postgres. That is the behaviour the old `backend` entry had and
 * changing it silently would be worse than leaving it. To run against the local
 * SQLite copy instead, start with BAAKHAPAA_DEMO=1: it passes placeholder
 * Supabase credentials, which is what `database.use_mock` keys off, and seeds
 * the test@example.com / password login.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEMO = process.env.BAAKHAPAA_DEMO === "1";

const backendEnv = DEMO
  ? {
      // A placeholder URL is the documented switch for the local SQLite path
      // (database.py line 10), so demo mode is requested the same way a
      // machine without credentials gets it — not by a second code path.
      SUPABASE_URL: "https://your-supabase.co",
      SUPABASE_KEY: "your-supabase-key",
      DEMO_SEED: "true",
      APP_ENV: "development",
    }
  : {};

const procs = [];

function start(name, command, args, cwd, env = {}) {
  // No `shell: true`. Node 24 raises DEP0190 for shell + args because they are
  // concatenated rather than escaped, and the only reason to want a shell here
  // was npm being a .cmd on Windows — which Node has refused to spawn without
  // one since the CVE-2024-27980 fix. Both processes are launched by absolute
  // path instead: python.exe directly, and vite through this same node binary.
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tag = `[${name}]`;
  const relay = (stream, to) => {
    stream.on("data", (b) => {
      for (const line of b.toString().split(/\r?\n/)) {
        if (line.trim()) to.write(`${tag} ${line}\n`);
      }
    });
  };
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);

  child.on("exit", (code) => {
    // One half dying leaves a site that looks up but cannot log in, which is
    // the most confusing possible state. Take the whole thing down instead.
    console.log(`${tag} exited with ${code} — stopping the other half`);
    shutdown(code ?? 1);
  });

  procs.push(child);
  return child;
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (p.exitCode !== null || !p.pid) continue;
    if (process.platform === "win32") {
      // child.kill() reaches npm.cmd but not the vite process it spawned, so
      // port 3000 would stay held after this exits. /T kills the tree.
      spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      p.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(
  DEMO
    ? "Starting in DEMO mode — local SQLite, login test@example.com / password"
    : "Starting against the configured .env — on this machine that is PRODUCTION Supabase",
);

start(
  "backend",
  join(ROOT, "baakhapaa-backend", "venv", "Scripts", "python.exe"),
  ["-m", "uvicorn", "main:app", "--port", "8000", "--log-level", "warning"],
  join(ROOT, "baakhapaa-backend"),
  backendEnv,
);

start(
  "frontend",
  process.execPath,
  [join(ROOT, "baakhapaa-frontend", "node_modules", "vite", "bin", "vite.js"),
   "--port", "3000"],
  join(ROOT, "baakhapaa-frontend"),
  { BROWSER: "none" },
);
