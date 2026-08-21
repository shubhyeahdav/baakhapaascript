import React, { useCallback, useEffect, useState } from "react";
import { projects as projectsApi } from "../services/api";

/**
 * Per-project team management (proposal FR12).
 *
 * Roles are per project rather than global, because a person is usually a
 * writer on their own work and a reader on someone else's, and one global role
 * cannot express that. So this panel picks a project first, then manages who is
 * on it.
 */

const ROLE_BLURB = {
  admin: "Everything an editor can do, plus managing members and deleting the project.",
  editor: "Write the script, add scenes, generate storyboards, export.",
  viewer: "Read the script and the board, and leave notes. Cannot change anything.",
};

export default function TeamPanel() {
  const [list, setList] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [members, setMembers] = useState([]);
  const [yourRole, setYourRole] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    projectsApi.getAll()
      .then((res) => {
        setList(res.data);
        if (res.data.length) setProjectId((current) => current || res.data[0].id);
      })
      .catch(() => setList([]));
  }, []);

  const loadMembers = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await projectsApi.members(projectId);
      setMembers(res.data.members || []);
      setYourRole(res.data.your_role);
    } catch (err) {
      setMembers([]);
      setError(err.response?.data?.detail || "Could not load the team.");
    }
  }, [projectId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const isAdmin = yourRole === "admin";

  const act = async (fn, success) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await loadMembers();
      if (success) setNotice(success);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string" ? detail
          : Array.isArray(detail) ? detail.map((d) => d.msg).join("; ")
          : "That didn't work."
      );
    } finally {
      setBusy(false);
    }
  };

  const add = (e) => {
    e.preventDefault();
    act(
      () => projectsApi.addMember(projectId, email.trim(), role),
      `${email.trim()} can now ${role === "viewer" ? "read" : "work on"} this project.`
    ).then(() => setEmail(""));
  };

  return (
    <div className="animate-fade-up">
      <label className="block mb-6">
        <span className="text-[11px] font-mono uppercase tracking-wider text-inkMuted">Project</span>
        <select
          aria-label="Project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="mt-1.5 w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-inkSoft"
        >
          {list.length === 0 && <option value="">No projects yet</option>}
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}{p.owner === false ? ` — shared with you (${p.your_role})` : ""}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p className="mb-4 text-[12.5px] text-red-300 bg-red-400/10 border border-red-400/25 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 text-[12.5px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      <div className="border-t border-borderSoft">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-4 py-4 border-b border-borderSoft">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-ink truncate">
                {m.name || m.email}
                {m.owner && <span className="text-inkMuted"> (owner)</span>}
              </div>
              <div className="text-[12px] text-inkMuted truncate">{m.email}</div>
            </div>

            {m.owner || !isAdmin ? (
              <span className="font-mono text-[10px] uppercase tracking-wider text-inkSoft">
                {m.role}
              </span>
            ) : (
              <>
                <select
                  aria-label={`Role for ${m.email}`}
                  value={m.role}
                  disabled={busy}
                  onChange={(e) =>
                    act(() => projectsApi.setMemberRole(projectId, m.user_id, e.target.value))
                  }
                  className="bg-bg border border-border rounded-lg px-2 py-1.5 text-[12px] text-inkSoft"
                >
                  {["admin", "editor", "viewer"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  onClick={() => act(() => projectsApi.removeMember(projectId, m.user_id))}
                  disabled={busy}
                  aria-label={`Remove ${m.email}`}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border text-inkMuted hover:text-red-300 hover:border-red-400/40 disabled:opacity-40"
                >
                  Remove
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {isAdmin ? (
        <form onSubmit={add} className="mt-8 rounded-2xl border border-borderSoft p-5">
          <p className="text-ink font-display text-lg mb-1">Add someone</p>
          {/* Honest about the limitation rather than pretending an invite was
              sent: there is no invitation email yet, so the person has to have
              an account already. */}
          <p className="text-inkMuted text-[12.5px] mb-4">
            They need a Baakhapaa account already — invitations by email aren't built yet.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="their@email.com"
              aria-label="Email"
              className="field flex-1 min-w-[200px]"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Role"
              className="bg-bg border border-border rounded-xl px-3 text-sm text-inkSoft"
            >
              {["editor", "viewer", "admin"].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button type="submit" disabled={busy || !projectId} className="btn-gold text-sm px-5">
              {busy ? "Working…" : "Add"}
            </button>
          </div>
          <p className="text-[11.5px] text-inkMuted mt-3 leading-snug">{ROLE_BLURB[role]}</p>
        </form>
      ) : (
        yourRole && (
          <p className="mt-6 text-[12.5px] text-inkMuted">
            You're {yourRole === "editor" ? "an" : "a"} <strong className="text-inkSoft">{yourRole}</strong> on
            this project. Only an admin can change who has access.
          </p>
        )
      )}
    </div>
  );
}
