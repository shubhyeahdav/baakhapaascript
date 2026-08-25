import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  plugins: [react()],
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
