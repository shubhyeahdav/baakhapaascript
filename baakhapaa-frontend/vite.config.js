import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Serve the root Terms and Privacy Policy to the app as one virtual module.
 *
 * Those two files live at the repo root because that is where the project
 * treats them as canonical — `LEGAL_REVIEW.md` edits them there. The app needs
 * their text, and the three obvious ways to get it are all worse: a second
 * copy under `src/` drifts and eventually shows users the older document;
 * `?raw` from outside the Vite root trips the dev server's fs allow-list and
 * Vitest's separately; and `public/` would ship them as separate fetches.
 *
 * A virtual module reads them at build time, needs no path permissions, and
 * behaves identically in dev, build and test.
 */
function legalDocuments() {
  const VIRTUAL = "virtual:legal-documents";
  const read = (name) =>
    readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

  return {
    name: "baakhapaa-legal-documents",
    resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : null),
    load(id) {
      if (id !== `\0${VIRTUAL}`) return null;
      return [
        `export const terms = ${JSON.stringify(read("Terms_of_Use.md"))};`,
        `export const privacy = ${JSON.stringify(read("Privacy_Policy.md"))};`,
      ].join("\n");
    },
  };
}

/**
 * Start the handshake to the API while the JavaScript is still downloading.
 *
 * Measured against the deployed pair on 2026-09-18, forced to IPv4, from this
 * machine. A request to Railway costs, on a CLEAN connection:
 *
 *     connect  0.09s   TLS  +0.08s   response  +0.27s   = ~0.45s
 *
 * and roughly one attempt in four never gets a clean connection at all:
 * `connect` was 1.11s, 4.20s and 15.12s across the samples, with everything
 * after it normal. That is SYN loss on the path, not slow code -- Vercel over
 * the same seconds was 0.04-0.06s every time, so the network here is fine and
 * the problem is specific to reaching Railway.
 *
 * None of that handshake starts until React has mounted and something calls
 * the API, because nothing in the HTML mentions the host. `preconnect` moves
 * it to parse time, in parallel with fetching the bundle: about 170ms saved
 * when the connection is clean, and seconds of SYN retries overlapped with
 * work the browser was doing anyway when it is not.
 *
 * It does NOT fix the loss; it hides it behind the download. The fix is
 * infrastructure -- see the note in DEPLOYMENT.md.
 *
 * Driven off `VITE_API_URL` rather than hardcoded, because the dev server
 * proxies the API at `/api` on its own origin and a preconnect to a relative
 * path is meaningless. Same-origin and unset both skip it rather than emitting
 * a tag that points nowhere.
 */
function preconnectToApi(apiUrl) {
  return {
    name: "baakhapaa-preconnect-api",
    transformIndexHtml() {
      let origin;
      try {
        origin = new URL(apiUrl).origin;
      } catch {
        return;  // relative (`/api`) or unset: nothing to preconnect to.
      }
      return [{
        tag: "link",
        // `crossorigin` because the API is fetched with CORS. Without it the
        // browser opens a SECOND connection for the real request and the
        // warmed one is wasted -- which would make this slower, not faster.
        attrs: { rel: "preconnect", href: origin, crossorigin: "" },
        injectTo: "head-prepend",
      }];
    },
  };
}

/**
 * Vite, replacing react-scripts.
 *
 * Two reasons, and only one of them is speed. Create React App is deprecated
 * and is the sole source of all 33 advisories `npm audit` reports — every one
 * of them in the build toolchain, none of them shipped, and none of them
 * fixable while it stays. And shadcn/ui cannot be installed into CRA at all,
 * so anything built on Radix primitives was blocked behind this move.
 *
 * `@` is here because that is the alias shadcn's generated components import
 * themselves by. Adding it now means those files drop in unedited later.
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    legalDocuments(),
    preconnectToApi(loadEnv(mode, process.cwd(), "").VITE_API_URL || ""),
  ],
  resolve: {
    // import.meta.dirname, not __dirname: this config is ESM now, and
    // Vite warns that the CommonJS global is going away.
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  server: {
    // CRA fell back to 3001 when 3000 was taken, and the backend's CORS and
    // the Google client's authorised origins both list the pair. `strictPort:
    // false` keeps that behaviour rather than failing to start.
    port: 3000,
    strictPort: false,
    /* Same-origin API, for opening the app on a phone.
       `--host` publishes this server on the LAN, but the app then still called
       the backend on its own port and its own address, which needs a second
       inbound hole in the firewall and a hardcoded LAN IP in the environment.
       On this machine the Ethernet network is classified Public: `node.exe` has
       an inbound allow rule and the backend's venv Python does not, so the page
       loaded on the phone and every request from it failed.
       Set `VITE_API_URL=/api` and the dev server forwards to the backend over
       loopback instead. One port to reach, no CORS at all, and nothing to
       reconfigure when the LAN address changes. `VITE_PROXY_TARGET` moves the
       backend port. Dev only — the production build is served by Vercel and
       uses an absolute `VITE_API_URL`. */
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    outDir: "build",  // Vercel's config and the CI workflow both expect this.
  },
  test: {
    globals: true,          // `test`/`expect` without importing them, as Jest did.
    environment: "jsdom",
    setupFiles: "./src/setupTests.js",
    css: false,
    // Jest's own default, and what CRA silently switched on. Several suites
    // depend on it: implementations given inside a `vi.mock` factory are wiped
    // before each test, which is why the stubs live in beforeEach.
    // The editor suite renders the whole workspace — guide, coverage,
    // access log, craft panel — and is genuinely slower to mount than
    // anything else here. 5s was Jest's default and was already close.
    testTimeout: 15000,
    restoreMocks: true,
    mockReset: true,
  },
}));
