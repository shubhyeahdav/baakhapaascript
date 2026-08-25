import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import TopNav from "../components/TopNav";
import StoryBible from "../components/StoryBible";
import { scripts } from "../services/api";

/**
 * Project setup — the decisions that come before the page, and stay changeable.
 *
 * The story bible used to be a tab inside the writing panel, which put the
 * wrong thing in the wrong place twice over. It is setup, not feedback: a
 * writer fills it in once at the start and revisits it occasionally, while the
 * panel beside a draft should hold only what helps with the line being written
 * right now. Sitting there, it also cost the writing panel a fifth tab and
 * pushed the craft notes further from the page they describe.
 *
 * So it lives here, on its own screen, reachable from the project at any time —
 * because a bible written before the first scene is a guess, and the useful
 * version is the one the writer corrects in week three.
 *
 * The route parameter is a script id, matching `/projects/:id/editor`. The
 * naming is historical; the bible is stored on the script row.
 */
export default function ProjectSetup() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [script, setScript] = useState(null);
  const [bible, setBible] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    scripts
      .getById(id)
      .then((res) => {
        setScript(res.data);
        setBible(res.data.bible || null);
      })
      .catch(() => setError("Could not open this project."));
  }, [id]);

  const project = script?.project;

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <TopNav active="Projects" />

      <main className="flex-1 px-8 md:px-14 pb-20 max-w-3xl w-full">
        <Link
          to="/dashboard"
          className="text-[12.5px] text-inkMuted hover:text-gold transition-colors"
        >
          ← Projects
        </Link>

        <header className="mt-4 mb-8">
          <h1 className="font-display text-4xl text-ink">
            {project?.title || "Project setup"}
          </h1>
          <p className="text-inkSoft text-sm mt-2 leading-relaxed max-w-xl">
            What the script needs to exist but never appears on the page. Change
            any of it whenever the story changes — the editor reads this every
            time it generates or improves a scene.
          </p>
        </header>

        {error && (
          <p className="text-[13px] text-red-400 mb-6">{error}</p>
        )}

        {/* The parameters chosen at creation. Shown rather than hidden so the
            writer can see what the generator is working from, even though the
            create-project endpoint has no update counterpart yet. */}
        {project && (
          <section className="mb-8 rounded-xl border border-border bg-surface p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-inkMuted mb-3">
              Format
            </h2>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                ["Format", project.format],
                ["Genre", project.genre],
                ["Tone", project.tone],
                ["Audience", project.target_audience],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10.5px] text-inkMuted mb-0.5">{label}</dt>
                  <dd className="text-[13px] text-inkSoft capitalize">
                    {value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-inkMuted mb-4">
            Story bible
          </h2>
          {script ? (
            <StoryBible scriptId={id} initial={bible} onChange={setBible} />
          ) : (
            !error && <p className="text-[13px] text-inkMuted">Loading…</p>
          )}
        </section>

        <div className="mt-8">
          <button
            type="button"
            onClick={() => navigate(`/projects/${id}/editor`)}
            className="text-[13px] font-semibold text-bgDeep bg-ink hover:bg-gold px-[18px] py-2 rounded-full transition-colors"
          >
            Go to the script
          </button>
        </div>
      </main>
    </div>
  );
}
