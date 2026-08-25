import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";
import { projects, scripts, exportApi } from "../services/api";
import { downloadBlob, safeFilename } from "../utils/download";
import { useAuth } from "../context/AuthContext";

const FORMATS = [
  { key: "pdf", label: "PDF", ext: "pdf", free: true },
  // Free on purpose: a writer who cannot get their script into Final Draft,
  // Celtx or Arc Studio has to retype it, and PDF/Word are both read-only as
  // far as screenplay structure goes.
  { key: "fdx", label: "Final Draft", ext: "fdx", free: true },
  { key: "word", label: "Word", ext: "docx", free: false },
  { key: "package", label: "Package", ext: "pdf", free: false },
];

// One place to pull deliverables out of any project, instead of having to open
// each script and hunt for the export button.
export default function ExportsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // `${projectId}:${format}`
  const { user } = useAuth();
  const navigate = useNavigate();
  const isFree = !["pro", "studio"].includes(user?.subscription_tier);

  useEffect(() => {
    projects
      .getAll()
      .then((res) => setList(res.data))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  // Export routes take a SCRIPT id — resolve from the project, then download.
  const download = async (project, fmt) => {
    const tag = `${project.id}:${fmt.key}`;
    if (busy) return;
    setBusy(tag);
    try {
      const s = await scripts.getByProject(project.id);
      const res = await exportApi[fmt.key](s.data.id);
      downloadBlob(res.data, `${safeFilename(project.title)}.${fmt.ext}`);
    } catch (err) {
      alert(err.response?.data?.detail || `Could not export ${fmt.label}.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="cine-bg min-h-screen flex flex-col text-ink">
      <TopNav active="Projects" />

      <main className="flex-1 px-8 md:px-14 pb-14">
        <div className="py-8">
          <p className="font-mono text-[11px] tracking-[0.16em] text-inkMuted mb-2">STUDIO</p>
          <h1 className="font-display text-4xl md:text-5xl text-ink">Exports</h1>
        </div>

        {loading ? (
          <div className="space-y-px">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 bg-elevated/30 animate-pulse" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-start justify-center min-h-[40vh] animate-fade-up">
            <p className="font-mono text-[11px] tracking-[0.14em] text-inkMuted mb-5">NOTHING TO EXPORT YET</p>
            <h2 className="font-display text-4xl md:text-5xl leading-[1] text-ink mb-6 max-w-2xl">
              Write something<br />worth printing.
            </h2>
            <button onClick={() => navigate("/projects/new")} className="btn-gold">
              Start a project →
            </button>
          </div>
        ) : (
          <div className="animate-fade-up">
            <div className="flex items-baseline justify-between py-4">
              <span className="font-mono text-[11px] tracking-[0.14em] text-inkMuted">
                ALL PROJECTS ({list.length})
              </span>
              <span className="font-mono text-[11px] tracking-[0.14em] text-inkMuted">
                SCRIPT · SHOT LIST · PACKAGE
              </span>
            </div>
            {list.map((p, i) => (
              <div
                key={p.id}
                className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-[18px] border-b border-borderSoft"
              >
                <span className="font-mono text-xs text-gold w-8 flex-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-display text-xl md:text-2xl text-ink flex-1 min-w-0 truncate">
                  {p.title}
                </span>
                <span className="hidden md:block text-[12.5px] text-inkMuted w-36 flex-none">
                  {p.genre} · {p.duration_minutes} min
                </span>
                <div className="flex gap-2 flex-none">
                  {FORMATS.map((f) => {
                    const locked = isFree && !f.free;
                    return (
                      <button
                        key={f.key}
                        onClick={() => (locked ? navigate("/pricing") : download(p, f))}
                        disabled={busy === `${p.id}:${f.key}`}
                        title={locked ? "Pro / Studio feature" : `Export ${f.label}`}
                        className={`text-[11.5px] px-3 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                          locked
                            ? "border-border text-inkMuted/60 hover:text-gold hover:border-gold/30"
                            : "border-border text-inkSoft hover:text-gold hover:border-gold/40"
                        }`}
                      >
                        {busy === `${p.id}:${f.key}` ? "…" : f.label}
                        {locked ? " ✦" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {isFree && (
              <p className="text-[12px] text-inkMuted mt-5">
                ✦ Word and production-package exports are part of Pro and Studio.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
