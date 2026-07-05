import React, { useEffect, useState } from "react";
import { realtimeClient, joinScriptPresence } from "../services/realtime";
import { useAuth } from "../context/AuthContext";

const AVATAR_COLORS = ["#6366F1", "#38BDF8", "#34D399", "#F59E0B", "#F472B6"];

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Live presence strip for the script editor toolbar. Shows who else has this
// script open via Supabase Realtime presence; solo badge when not configured.
export default function CollabBar({ scriptId }) {
  const { user } = useAuth();
  const [people, setPeople] = useState([]);

  useEffect(() => {
    if (!realtimeClient || !user) return;
    return joinScriptPresence(scriptId, user, setPeople);
  }, [scriptId, user]);

  if (!realtimeClient) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-inkMuted" title="Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY to .env for live collaboration">
        <span className="w-1.5 h-1.5 rounded-full bg-inkMuted/50" />
        Solo session
      </div>
    );
  }

  const others = people.filter((p) => p.id !== user?.id);

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {people.slice(0, 5).map((p, i) => (
          <div
            key={p.id}
            title={p.id === user?.id ? `${p.name} (you)` : p.name}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-surface"
            style={{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
          >
            {initials(p.name)}
          </div>
        ))}
        {people.length > 5 && (
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-inkSoft bg-elevated border-2 border-surface">
            +{people.length - 5}
          </div>
        )}
      </div>
      <span className="flex items-center gap-1.5 text-[11px] text-inkMuted">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        {others.length === 0 ? "Live · just you" : `Live · ${others.length + 1} editing`}
      </span>
    </div>
  );
}
