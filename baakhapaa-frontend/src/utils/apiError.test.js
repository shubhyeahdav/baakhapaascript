import { authErrorMessage } from "./apiError";

const FALLBACK = "Login failed. Please try again.";

test("uses the server's own sentence when there is one", () => {
  const err = { response: { status: 400, data: { detail: "Email already registered" } } };
  expect(authErrorMessage(err, FALLBACK)).toBe("Email already registered");
});

test("a rate-limited user is told to wait, not that their password is wrong", () => {
  // slowapi answers 429 with {"error": ...} and no `detail`, so this used to
  // fall through to "Login failed" — the one message that makes someone
  // immediately try again and stay locked out.
  const err = { response: { status: 429, data: { error: "Rate limit exceeded: 5 per 1 minute" } } };
  expect(authErrorMessage(err, FALLBACK)).toMatch(/too many attempts/i);
});

test("flattens FastAPI's 422 list into a readable sentence", () => {
  // Handing the raw array to React renders nothing and throws.
  const err = {
    response: {
      status: 422,
      data: { detail: [{ msg: "Value error, Enter a valid email address." }] },
    },
  };
  expect(authErrorMessage(err, FALLBACK)).toBe("Enter a valid email address.");
});

test("joins more than one validation problem", () => {
  const err = {
    response: {
      status: 422,
      data: {
        detail: [
          { msg: "Value error, Enter a valid email address." },
          { msg: "Value error, Enter your name." },
        ],
      },
    },
  };
  expect(authErrorMessage(err, FALLBACK)).toBe("Enter a valid email address. Enter your name.");
});

test("never returns an object for React to render", () => {
  const err = { response: { status: 422, data: { detail: [{ loc: ["body"], type: "x" }] } } };
  expect(typeof authErrorMessage(err, FALLBACK)).toBe("string");
});

test("names a network failure as a network failure", () => {
  expect(authErrorMessage({ request: {} }, FALLBACK)).toMatch(/can't reach the server/i);
});

test("falls back when the server says nothing useful", () => {
  expect(authErrorMessage({ response: { status: 500, data: {} } }, FALLBACK)).toBe(FALLBACK);
});
