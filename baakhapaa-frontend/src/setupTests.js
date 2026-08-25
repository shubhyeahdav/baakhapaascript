// Loaded automatically by react-scripts before every test file.
// Adds jest-dom's element matchers (toBeInTheDocument, toHaveValue, ...).
import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";

// A test that installs fake timers and then times out never reaches its own
// cleanup, and the frozen clock then hangs every test after it — one failure
// reads as four. This makes that impossible regardless of how a test ends.
afterEach(() => {
  vi.useRealTimers();
});
