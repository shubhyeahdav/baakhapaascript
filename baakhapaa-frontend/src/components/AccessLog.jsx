import React, { useEffect, useState } from "react";
import { scripts } from "../services/api";

/**
 * Who has been in this script.
 *
 * Sharing works, so an unpublished screenplay can be opened by other people —
 * and until now the writer had no way to find out that it had been. That is a
 * strange gap in a product whose whole subject is unpublished work.
 *
 * Shown inside History, beside the version list, because both answer the same
 * question about the document: what has happened to it. Versions answer what
 * changed; this answers who was here.
 *
 * A 403 is not an error state. Only a project admin may read this, so a
 * collaborator opening the History tab is expected to be refused — and telling
 * them "you are not allowed" would advertise the existence of a log they have
 * no business seeing. It simply renders nothing.
 */
const LABEL = {
  opened: "opened it",
  exported: "took a copy",
  imported: "replaced the draft",
};

function when(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return then.toLocaleDateString();
}

export default function AccessLog({ scriptId }) {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    let cancelled = false;
    scripts
      .accessLog(scriptId)
      .then((res) => {
        if (!cancelled) setEntries(res.data.entries || []);
      })
      .catch(() => {
        // 403 for a non-admin, and that is the designed answer rather than a
        // failure. Rendering nothing is the whole handling.
        if (!cancelled) setEntries(null);
      });
    return () => {
      cancelled = true;
    };
  }, [scriptId]);

  if (!entries) return null;

  return (
    <div>
      <p className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-2">
        Who has been here
      </p>

      {entries.length === 0 ? (
        <p className="text-[11.5px] text-inkMuted leading-snug">
          Nobody but you has opened this script.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e, i) => (
            <li
              key={`${e.email}-${e.at}-${i}`}
              className="flex items-baseline gap-2 text-[12px]"
            >
              <span className="text-inkSoft truncate">{e.name}</span>
              <span className="text-inkMuted shrink-0">{LABEL[e.action] || e.action}</span>
              <span className="ml-auto font-mono text-[10px] text-inkMuted shrink-0">
                {when(e.at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10.5px] text-inkMuted mt-2 leading-snug">
        Only you can see this. It records who and when, never what.
      </p>
    </div>
  );
}
