import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The AI failure path must never be able to reach the writer's draft.
 *
 * Found on 2026-09-25 by running the product with both providers down. The
 * catch in `handleAI` wrote `"Error: " + detail` into `aiResponse` — the same
 * state `acceptAI` inserts into the page. The panel rendered a green **Accept**
 * under the provider's error text, and because a scoped improve calls
 * `replaceRange(scope.start, scope.end, text)`, pressing it replaced the
 * writer's highlighted lines with
 * `Error: tokenrouter API error: Request timed out.` Autosave then persisted
 * that a second later, leaving the undo stack as the only recovery.
 *
 * `AssistPanel.test.jsx` covers the rendering half — an error block with no
 * Accept beside it. It cannot cover THIS half: a future edit could put the
 * error back into `aiResponse` and every one of those tests would stay green,
 * because the panel would be doing exactly what it was told.
 *
 * So this reads the source, the way `test_renewal_ordering.py` reads the JSX to
 * pin which of two windows is larger. A string test is blunt, but the property
 * it protects is simple and absolute: the suggestion channel carries answers,
 * the error channel carries failures, and they are never the same variable.
 */
/* `import.meta.url` is not a file: URL under jsdom, so this resolves from
   vitest's root instead. */
const SRC = readFileSync(resolve(process.cwd(), "src/pages/ScriptEditor.jsx"), "utf8");

test("an AI failure is never written into the suggestion state", () => {
  // Any `setAiResponse("Error...")` or `setAiResponse('Error...')`, however it
  // is spaced or concatenated.
  expect(SRC).not.toMatch(/setAiResponse\(\s*["'`]Error/);
});

test("the failure path has its own state", () => {
  expect(SRC).toMatch(/const \[aiError, setAiError\] = useState\(/);
});

test("the catch routes to the error channel and clears any partial answer", () => {
  // A half-streamed rewrite that stopped because the provider died is not an
  // answer either, so the catch clears `aiResponse` as well as setting the error.
  // Scoped to handleAI. `setActMinutes` has the file's first `catch (err)` and
  // legitimately alerts, so an unscoped search reads the wrong block.
  const handler = SRC.slice(SRC.indexOf("const handleAI = async () => {"));
  const catchBlock = handler.slice(handler.indexOf("} catch (err) {"));
  const upToFinally = catchBlock.slice(0, catchBlock.indexOf("} finally {"));

  expect(upToFinally).toMatch(/setAiError\(/);
  expect(upToFinally).toMatch(/setAiResponse\(""\)/);
});

test("a new request clears the previous failure", () => {
  // Otherwise a stale "AI unavailable" sits under a request that is working.
  const handler = SRC.slice(SRC.indexOf("const handleAI = async () => {"));
  expect(handler.slice(0, 200)).toMatch(/setAiError\(""\)/);
});
