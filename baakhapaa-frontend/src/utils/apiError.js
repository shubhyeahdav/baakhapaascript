// Turn an axios error into a message a user can act on. Distinguishes a real
// server response (use its detail) from a network failure (server unreachable),
// so a backend/CORS problem no longer looks like "wrong password".
export function authErrorMessage(err, fallback) {
  if (err?.request && !err?.response) {
    return "Can't reach the server — make sure the backend is running, then try again.";
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
