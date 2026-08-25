import React, { useState } from "react";
import { scripts } from "../services/api";
import { authErrorMessage } from "../utils/apiError";

/**
 * The reader's report on the draft.
 *
 * Everything here was already being computed and shown in four different
 * panels — structure findings, craft flags, corpus percentiles, statistics —
 * which left the writer to assemble the answer to the one question they
 * actually have. This is that assembly.
 *
 * Run on request rather than on load. It is cheap, but a report that reappears
 * every time the panel opens invites reading it as a score that keeps changing,
 * and a writer mid-scene does not need a verdict on the whole script.
 */

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <p className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex items-baseline justify-between text-[12px] py-0.5">
      <span className="text-inkMuted">{label}</span>
      <span className="text-inkSoft font-mono tabular-nums">{value ?? "—"}</span>
    </div>
  );
}

export default function CoveragePanel({ scriptId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await scripts.coverage(scriptId);
      setReport(res.data);
    } catch (err) {
      setError(authErrorMessage(err, "Could not read this draft."));
    } finally {
      setLoading(false);
    }
  };

  if (!report) {
    return (
      <div>
        <p className="text-[12.5px] text-inkSoft leading-relaxed mb-3">
          A reader's report on the whole draft — what it is, how long it runs,
          what is structurally off, and what to fix first.
        </p>
        <p className="text-[11px] text-inkMuted leading-snug mb-4">
          Costs nothing and uses no AI. Every number in it is measured, so it
          works on a half-written draft and says the same thing twice.
        </p>
        {error && (
          <p role="alert" className="text-[11.5px] text-red-300 mb-3">{error}</p>
        )}
        <button
          onClick={run}
          disabled={loading}
          className="btn-gold w-full text-sm py-2 disabled:opacity-50"
        >
          {loading ? "Reading…" : "Read my draft"}
        </button>
      </div>
    );
  }

  const { premise, runtime, structure, craft, shape, comparison, next_steps } = report;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-4">
        <h3 className="font-display text-[16px] text-ink truncate">{report.title}</h3>
        <button
          onClick={run}
          className="ml-auto text-[10.5px] text-inkMuted hover:text-gold shrink-0"
        >
          ↻ Re-read
        </button>
      </div>

      <Section title="Premise">
        {premise.logline ? (
          <p className="text-[12.5px] text-inkSoft leading-snug">{premise.logline}</p>
        ) : (
          // Reported rather than invented. "No logline" is itself the most
          // useful note an unfinished project can get.
          <p className="text-[12px] text-inkMuted leading-snug">
            No logline yet — one sentence in Project Setup is the fastest way to
            make everything else here sharper.
          </p>
        )}
      </Section>

      <Section title="Runtime">
        <Stat label="Pages" value={runtime.pages} />
        <Stat label="Minutes" value={runtime.minutes} />
        <Stat label="Planned" value={runtime.planned_minutes} />
        <Stat label="Scenes" value={runtime.scenes} />
        <Stat label="Speaking characters" value={runtime.speaking_characters} />
      </Section>

      {next_steps?.length > 0 && (
        <Section title="Fix first">
          <ul className="space-y-1.5">
            {next_steps.map((step, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-inkSoft leading-snug">
                <span className="font-mono text-[9.5px] uppercase text-gold/70 shrink-0 mt-0.5">
                  {step.from}
                </span>
                <span className="min-w-0">{step.note}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {shape?.length > 0 && (
        <Section title="Shape">
          <div className="space-y-2.5">
            {shape.map((note) => (
              <div key={note.metric}>
                <p className="text-[11px] text-gold/70 font-mono">
                  {note.metric} · {note.value}
                </p>
                <p className="text-[12px] text-inkSoft leading-snug">{note.reading}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Notes found">
        <Stat label="Structural" value={structure.counts?.high ?? 0} />
        <Stat label="Cannot be filmed" value={craft.by_confidence?.mechanical ?? 0} />
        <Stat label="Against convention" value={craft.by_confidence?.convention ?? 0} />
        <Stat label="A reading" value={craft.by_confidence?.judgement ?? 0} />
      </Section>

      {comparison ? (
        <Section title={`Against ${comparison.cohort_size} produced scripts`}>
          <div className="space-y-1.5">
            {(comparison.notes || []).slice(0, 4).map((n) => (
              <p key={n.metric} className="text-[12px] text-inkSoft leading-snug">
                {n.message || `${n.metric}: ${Math.round(n.percentile * 100)}th percentile`}
              </p>
            ))}
          </div>
        </Section>
      ) : (
        <Section title="Against produced scripts">
          <p className="text-[11.5px] text-inkMuted leading-snug">
            Opens once there are eight scenes. Percentiles on a shorter draft
            describe the draft's length, not its shape.
          </p>
        </Section>
      )}

      {/* Said out loud, because every competing tool's coverage ends in a
          verdict and a reader will look for one here. */}
      <p className="text-[10.5px] text-inkMuted leading-snug border-t border-borderSoft pt-3 mt-1">
        {report.no_verdict}
      </p>
    </div>
  );
}
