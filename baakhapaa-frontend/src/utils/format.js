// Shared display helpers for backend rows (versions, comments).

// Rows carry user_id; user_name appears once the backend joins it in.
export function userLabel(row) {
  return row.user_name || (row.user_id ? `User ${String(row.user_id).slice(0, 6)}` : "Unknown");
}

export function formatTime(ts) {
  if (!ts) return "Unknown time";
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
