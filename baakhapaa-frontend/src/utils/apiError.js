/* What to say when the server cannot be reached at all.
 *
 * Two audiences, two sentences. A developer running the site locally has
 * usually just not started uvicorn, and the useful thing is to say so. A writer
 * on the deployed site cannot start anything — and "make sure the backend is
 * running" was exactly what they were shown when the Railway service went
 * away, which reads as the product blaming them for an outage.
 *
 * The production sentence makes no promise about their work. On the sign-in
 * page there is none at stake, and in the editor an unsaved edit genuinely is
 * unsaved while the server is gone; "your work is safe" would be the one
 * reassuring thing that could be false. `import.meta.env.DEV` is Vite's own
 * flag, true under `vite` and false in `vite build`. */
export const UNREACHABLE = {
  dev: "Can't reach the server — make sure the backend is running, then try again.",
  prod: "Baakhapaa can't reach its server right now. That's on our side — please try again in a few minutes.",
};

export const unreachableMessage = (isDev = Boolean(import.meta.env?.DEV)) =>
  (isDev ? UNREACHABLE.dev : UNREACHABLE.prod);

// Turn an axios error into a message a user can act on. Distinguishes a real
// server response (use its detail) from a network failure (server unreachable),
// so a backend/CORS problem no longer looks like "wrong password".
export function authErrorMessage(err, fallback) {
  if (err?.request && !err?.response) {
    return unreachableMessage();
  }
  if (!err?.response) return fallback;

  const { status, data } = err.response;

  // The credential endpoints are rate limited at 5/min per IP. slowapi answers
  // with {"error": ...} and no `detail`, so this fell through to the generic
  // message and told a locked-out user their password was wrong — which is the
  // one message guaranteed to make them try again and stay locked out.
  if (status === 429) {
    return "Too many attempts. Wait about a minute, then try again.";
  }

  // FastAPI returns 422 validation errors as a LIST of objects. Handing that
  // straight to React renders nothing and throws; it has to be flattened into
  // the sentence the validator already wrote.
  const detail = data?.detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((d) => (typeof d === "string" ? d : d?.msg))
      .filter(Boolean)
      // Pydantic prefixes its own message with "Value error, ".
      .map((m) => m.replace(/^Value error,\s*/i, ""));
    return messages.length ? messages.join(" ") : fallback;
  }

  if (typeof detail === "string" && detail) return detail;
  if (typeof data?.error === "string" && data.error) return data.error;
  return fallback;
}
