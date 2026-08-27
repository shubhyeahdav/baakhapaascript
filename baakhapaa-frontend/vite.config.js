import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
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
export default defineConfig({
  plugins: [react(), legalDocuments()],
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
});
