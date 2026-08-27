import React, { useCallback, useEffect, useState } from "react";
import { projects as projectsApi } from "../services/api";

/**
 * Per-project team management (proposal FR12).
 *
 * Roles are per project rather than global, because a person is usually a
 * writer on their own work and a reader on someone else's, and one global role
 * cannot express that.
 *
 * Two mountings, one component. Given a `projectId` it manages that project and
 * hides the picker — this is how it appears from inside the editor, where the
 * writer has already said which project they mean and being asked again reads
 * as the product having lost track. Without one it picks a project first, which
 * is the Settings mounting, kept because "who can see my work" is also a
 * question people go looking for in an account screen rather than in a script.
 */

const ROLE_BLURB = {
  admin: "Everything an editor can do, plus managing members and deleting the project.",
  editor: "Write the script, add scenes, generate storyboards, export.",
  viewer: "Read the script and the board, and leave notes. Cannot change anything.",
};

export default function TeamPanel({ projectId: fixedProjectId }) {
  const [list, setList] = useState([]);
  const [projectId, setProjectId] = useState(fixedProjectId || "");
  const [members, setMembers] = useState([]);
  const [yourRole, setYourRole] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // People invited who have not registered yet, and the link most recently
  // produced. No email is sent — see `invites.py` — so the link has to be
  // visible and copyable or the invitation goes nowhere.
  const [pending, setPending] = useState([]);
  const [lastLink, setLastLink] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Mounted on a known project, there is nothing to choose and no reason to
    // fetch every project the writer owns.
    if (fixedProjectId) return;
    projectsApi.getAll()
      .then((res) => {
        setList(res.data);
        if (res.data.length) setProjectId((current) => current || res.data[0].id);
      })
      .catch(() => setList([]));
  }, [fixedProjectId]);

  const loadMembers = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await projectsApi.members(projectId);
      setMembers(res.data.members || []);
      setYourRole(res.data.your_role);
      try {
        const inv = await projectsApi.invites(projectId);
        setPending(inv.data.invites || []);
      } catch {
        // A viewer may read this, but an older deployment may not serve it.
        // Pending invitations are additional information, never load-bearing.
        setPending([]);
      }
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
      return true;
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string" ? detail
          : Array.isArray(detail) ? detail.map((d) => d.msg).join("; ")
          : "That didn't work."
      );
      // Reported, so a caller that sets its own notice does not announce a
      // success over the error this just displayed.
      return false;
    } finally {
      setBusy(false);
    }
  };

  const inviteLink = (token) => `${window.location.origin}/invite/${token}`;

  const add = (e) => {
    e.preventDefault();
    const address = email.trim();
    setLastLink(null);
    setCopied(false);
    // What the role actually lets them do, in the writer's own words rather
    // than the system's — "editor" is our vocabulary, "work on this project"
    // is theirs.
    const can = role === "viewer" ? "read" : "work on";
    let message = `${address} can now ${can} this project.`;

    act(async () => {
      const res = await projectsApi.addMember(projectId, address, role);
      // Two outcomes. An address with an account joins immediately; one without
      // becomes an invitation the inviter still has to deliver — and saying
      // "can now" about somebody who has not signed up would be a lie.
      if (res.data?.pending) {
        setLastLink({ email: res.data.email, url: inviteLink(res.data.token) });
        message = `${address} will be able to ${can} this project once they sign up.`;
      }
      return res;
    }, null).then((ok) => {
      if (!ok) return;
      setEmail("");
      setNotice(message);
    });
  };

  const copyLink = async () => {
    if (!lastLink) return;
    try {
      await navigator.clipboard.writeText(lastLink.url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused. The link is on screen and selectable,
      // so saying nothing is better than an error about a convenience.
      setCopied(false);
    }
  };

  return (
    <div className="animate-fade-up">
      {!fixedProjectId && (
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
      )}

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

      {/* The link for someone who has just been invited.
          No email is sent, so this is not a receipt — it is the invitation
          itself, and it does nothing until the inviter passes it on. Saying
          that plainly beats a confirmation that implies a message went out. */}
      {lastLink && (
        <div className="mb-4 rounded-xl border border-gold/30 bg-goldDim px-3.5 py-3">
          <p className="text-[12.5px] text-ink leading-snug">
            <span className="text-gold">{lastLink.email}</span> has no account yet.
            Send them this link — we do not email it for you.
          </p>
          <div className="flex gap-2 mt-2">
            <input
              readOnly
              value={lastLink.url}
              aria-label="Invitation link"
              onFocus={(e) => e.target.select()}
              className="field flex-1 min-w-0 text-[11.5px] font-mono"
            />
            <button
              type="button"
              onClick={copyLink}
              className="text-[12px] px-3 rounded-lg border border-gold/40 text-gold
                         hover:bg-gold/10 transition shrink-0"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-[11px] text-inkMuted mt-2 leading-snug">
            They join when they sign up with that address. The link only shows
            them what they are being invited to — it grants nothing on its own.
          </p>
        </div>
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

      {/* Invited and not yet arrived.
          Shown because these people occupy a seat from the moment they are
          invited — a cap the team could not see would look like a bug the first
          time it refused someone. */}
      {pending.length > 0 && (
        <div className="mt-5">
          <div className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-2">
            Invited · not signed up yet
          </div>
          {pending.map((i) => (
            <div key={i.id}
                 className="flex items-center gap-4 py-2.5 border-b border-borderSoft">
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] text-inkSoft truncate">{i.email}</div>
                <div className="text-[11px] text-inkMuted">
                  Joins as {i.role} when they sign up
                </div>
              </div>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setLastLink({ email: i.email, url: inviteLink(i.token) });
                      setCopied(false);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-border
                               text-inkMuted hover:text-gold hover:border-gold/40"
                  >
                    Link
                  </button>
                  <button
                    type="button"
                    onClick={() => act(
                      () => projectsApi.revokeInvite(projectId, i.id),
                      `${i.email} is no longer invited.`
                    )}
                    disabled={busy}
                    aria-label={`Cancel the invitation to ${i.email}`}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-border
                               text-inkMuted hover:text-red-300 hover:border-red-400/40
                               disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin ? (
        <form onSubmit={add} className="mt-8 rounded-2xl border border-borderSoft p-5">
          <p className="text-ink font-display text-lg mb-1">Add someone</p>
          {/* Still honest, but the limitation moved. Anyone can be invited now;
              what the product cannot do is deliver the message, so it says so
              rather than implying a mail went out. */}
          <p className="text-inkMuted text-[12.5px] mb-4">
            Anyone can be invited. If they have no account yet you will get a
            link to send them — we don't email it for you.
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
