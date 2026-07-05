import { createClient } from "@supabase/supabase-js";

// Supabase Realtime client for presence (who's editing this script right now).
// Demo mode: when env vars are missing or placeholders, exports null and the
// UI falls back to a solo session — same pattern as the backend mock clients.
const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;

const isConfigured = url && key && url.startsWith("http") && !url.includes("your-");

export const realtimeClient = isConfigured ? createClient(url, key) : null;

// Joins the presence channel for a script. Returns an unsubscribe function.
export function joinScriptPresence(scriptId, user, onSync) {
  if (!realtimeClient || !user) return () => {};

  const channel = realtimeClient.channel(`script:${scriptId}`, {
    config: { presence: { key: user.id } },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      // state: { [presenceKey]: [{ name, ... }] } → flatten to one entry per user
      const people = Object.entries(state).map(([id, metas]) => ({
        id,
        name: metas[0]?.name || "Unknown",
      }));
      onSync(people);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({ name: user.name });
      }
    });

  return () => {
    realtimeClient.removeChannel(channel);
  };
}
