import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { projects, scripts } from "../services/api";

// Global ⌘K / Ctrl-K command palette: cross-project search + quick actions.
// Built once here; new actions can be added to the `actions` list incrementally.
// Open it from anywhere by dispatching: window.dispatchEvent(new Event("open-command-palette"))
export default function CommandPalette() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [projList, setProjList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // Open/close via keyboard (⌘K / Ctrl-K) and an app-wide custom event.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  // Load projects the first time the palette opens.
  useEffect(() => {
    // `isAuthenticated` guards the render below, but `open` still flips for a
    // signed-out visitor — the login page listens for ⌘K too. Without this the
    // palette showed nothing and still fired GET /projects/, which 401s, and
    // the api client's interceptor answers a 401 by clearing the token and
    // setting window.location to /login.
    if (open && !loaded && isAuthenticated) {
      projects.getAll().then((r) => setProjList(r.data)).catch(() => {}).finally(() => setLoaded(true));
    }
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, loaded, isAuthenticated]);

  const openProject = async (projectId) => {
    setBusy(true);
    try {
      const res = await scripts.getByProject(projectId);
      setOpen(false);
      navigate(`/projects/${res.data.id}/editor`);
    } catch {
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  // Static actions + project matches, filtered by the query.
  const actions = useMemo(() => ([
    { id: "new", label: "New project", hint: "Create", run: () => { setOpen(false); navigate("/projects/new"); } },
    { id: "dash", label: "Go to dashboard", hint: "Navigate", run: () => { setOpen(false); navigate("/dashboard"); } },
  ]), [navigate]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const acts = actions.filter((a) => !q || a.label.toLowerCase().includes(q));
    const projs = projList
      .filter((p) => !q || `${p.title} ${p.genre} ${p.language}`.toLowerCase().includes(q))
      .map((p) => ({
        id: `p-${p.id}`,
        label: p.title,
        hint: `${p.genre} · ${p.language}`,
        run: () => openProject(p.id),
      }));
    return [...acts, ...projs];
  }, [query, actions, projList]);

  useEffect(() => { setActive(0); }, [query]);

  if (!isAuthenticated || !open) return null;

  const onListKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh] px-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7E7A6F" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onListKey}
            placeholder="Search projects or type a command…"
            className="flex-1 bg-transparent py-4 text-[15px] text-ink placeholder:text-inkMuted outline-none"
          />
          <span className="font-mono text-[10px] text-inkMuted border border-border rounded px-1.5 py-0.5">ESC</span>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-inkMuted text-sm">
              {loaded ? "No matches." : "Loading…"}
            </div>
          ) : (
            items.map((it, i) => (
              <button
                key={it.id}
                onMouseEnter={() => setActive(i)}
                onClick={it.run}
                disabled={busy}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                  active === i ? "bg-goldDim" : "hover:bg-white/[0.03]"
                }`}
              >
                <span className={`text-[14px] truncate ${active === i ? "text-gold" : "text-ink"}`}>{it.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-inkMuted ml-3 shrink-0">{it.hint}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-border font-mono text-[10px] text-inkMuted">
          <span>↑↓ navigate</span><span>↵ open</span><span>⌘K toggle</span>
        </div>
      </div>
    </div>
  );
}
