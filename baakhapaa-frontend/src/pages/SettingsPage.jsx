import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import TopNav from "../components/TopNav";
import TeamPanel from "../components/TeamPanel";
import { projects, auth as authApi } from "../services/api";
import { useAuth } from "../context/AuthContext";

const TABS = ["Account", "Team Members", "API Usage"];

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between py-4 border-b border-borderSoft">
      <span className="text-[13px] text-inkMuted">{label}</span>
      <span className="text-[14px] text-ink text-right">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleDeleteAccount = async () => {
    setBusy(true);
    setDeleteError("");
    try {
      await authApi.deleteAccount(confirmEmail.trim());
      // The account is gone, so the token points at nobody. Clear it locally
      // rather than leaving the app to discover that on the next request.
      logout();
    } catch (err) {
      setDeleteError(err.response?.data?.detail || "Could not delete the account.");
      setBusy(false);
    }
  };
  const navigate = useNavigate();
  // ?tab=team lets the Team nav item deep-link straight to the right tab.
  const [params] = useSearchParams();
  // Both sides get the same normalisation, so "?tab=teammembers",
  // "?tab=team%20members" and "?tab=team+members" all land on Team Members.
  const wanted = (params.get("tab") || "").toLowerCase().replace(/\s+/g, "");
  const deepLink = TABS.find((t) => t.toLowerCase().replace(/\s+/g, "") === wanted);
  const [tab, setTab] = useState(deepLink || "Account");
  const [stats, setStats] = useState(null);

  // Lightweight usage stats derived from the projects list (no usage-metering
  // backend yet — counts are the honest number we actually have).
  useEffect(() => {
    projects
      .getAll()
      .then((res) => {
        const list = res.data;
        setStats({
          projects: list.length,
          drafts: list.filter((p) => p.status !== "finalized").length,
          finalized: list.filter((p) => p.status === "finalized").length,
          minutes: list.reduce((n, p) => n + (p.duration_minutes || 0), 0),
        });
      })
      .catch(() => setStats(null));
  }, []);

  const tier = user?.subscription_tier || "free";
  const initials = (user?.name || "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="cine-bg min-h-screen flex flex-col text-ink">
      {/* Highlight Team in the bar when arriving via the Team nav item. */}
      <TopNav active="Settings" />

      <main className="flex-1 px-8 md:px-14 pb-14 max-w-3xl">
        <div className="py-8">
          <p className="font-mono text-[11px] tracking-[0.16em] text-inkMuted mb-2">STUDIO</p>
          <h1 className="font-display text-4xl text-ink">Settings</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-7 border-b border-border mb-8 text-[13px]">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 -mb-px transition-colors ${
                tab === t
                  ? "text-ink border-b border-gold"
                  : "text-inkMuted hover:text-inkSoft"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Account" && (
          <div className="animate-fade-up">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-elevated border border-border flex items-center justify-center text-sm text-inkSoft">
                {initials}
              </div>
              <div>
                <div className="text-ink text-[15px]">{user?.name}</div>
                <div className="text-inkMuted text-[12.5px]">{user?.email}</div>
              </div>
            </div>
            <Row label="Role" value={<span className="capitalize">{user?.role || "editor"}</span>} />
            <Row
              label="Plan"
              value={
                <span className="inline-flex items-center gap-3">
                  <span className="capitalize">{tier}</span>
                  {tier === "free" && (
                    <button
                      onClick={() => navigate("/pricing")}
                      className="text-[12px] text-gold border border-gold/30 rounded-full px-3 py-0.5 hover:bg-goldDim transition"
                    >
                      Upgrade
                    </button>
                  )}
                </span>
              }
            />
            <div className="mt-8">
              <button onClick={logout} className="btn-ghost text-sm">
                Sign out
              </button>
            </div>

            {/* Erasure.
                A screenwriting tool holds unproduced work. "Stop storing my
                script" has to be something a writer can do themselves, not a
                support request — and it has to be hard enough to reach that it
                never happens by accident. */}
            <div className="mt-12 rounded-2xl border border-red-400/25 bg-red-400/[0.04] p-5">
              <h3 className="text-ink font-display text-lg mb-1">Delete this account</h3>
              <p className="text-[13px] text-inkMuted leading-snug mb-4 max-w-lg">
                Every project you own goes with it — drafts, version history,
                storyboards and comments. Projects other people shared with you stay
                theirs. This cannot be undone.
              </p>

              {!deleting ? (
                <button
                  onClick={() => setDeleting(true)}
                  className="text-[13px] px-4 py-2 rounded-xl border border-red-400/40 text-red-300 hover:bg-red-500/10 transition"
                >
                  Delete account
                </button>
              ) : (
                <div className="max-w-md">
                  <label className="block text-[12.5px] text-inkSoft mb-2">
                    Type <strong className="text-ink">{user?.email}</strong> to confirm
                  </label>
                  <input
                    type="email"
                    aria-label="Confirm your email"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    placeholder={user?.email}
                    className="field w-full mb-3"
                  />
                  {deleteError && (
                    <p className="text-[12.5px] text-red-300 mb-3">{deleteError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={busy || confirmEmail.trim().toLowerCase() !== (user?.email || "").toLowerCase()}
                      className="text-[13px] px-4 py-2 rounded-xl border border-red-400/40 bg-red-500/15 text-red-200 hover:bg-red-500/25 disabled:opacity-40 transition"
                    >
                      {busy ? "Deleting…" : "Delete everything"}
                    </button>
                    <button
                      onClick={() => { setDeleting(false); setConfirmEmail(""); setDeleteError(""); }}
                      className="btn-ghost text-[13px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "Team Members" && <TeamPanel />}

        {tab === "API Usage" && (
          <div className="animate-fade-up">
            {stats ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  {[
                    ["Projects", stats.projects],
                    ["In draft", stats.drafts],
                    ["Finalized", stats.finalized],
                    ["Minutes planned", stats.minutes],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-borderSoft bg-surface px-5 py-4">
                      <div className="font-display text-3xl text-ink leading-none">{value}</div>
                      <div className="text-inkMuted text-[11px] tracking-[0.14em] uppercase mt-2">{label}</div>
                    </div>
                  ))}
                </div>
                <p className="text-inkMuted text-[12.5px] leading-relaxed max-w-md">
                  Per-call AI usage metering isn't tracked yet — these counts come
                  from your project library. Detailed usage reporting lands with
                  tier limits.
                </p>
              </>
            ) : (
              <p className="text-inkMuted text-sm">Could not load usage data.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
