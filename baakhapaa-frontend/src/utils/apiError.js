// Turn an axios error into a message a user can act on. Distinguishes a real
// server response (use its detail) from a network failure (server unreachable),
// so a backend/CORS problem no longer looks like "wrong password".
export function authErrorMessage(err, fallback) {
  if (err?.response) return err.response.data?.detail || fallback;
  if (err?.request) return "Can't reach the server — make sure the backend is running, then try again.";
  return fallback;
}
