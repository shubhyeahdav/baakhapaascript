import React, { useCallback, useEffect, useState } from "react";
import { shorts as shortsApi } from "../services/api";

/**
 * Outliers and results for a short (Month 4, Days 9-10).
 *
 * Under the rhythm meter, because that is where a short-form writer already
 * looks — not a new tab. Two quiet buttons; each opens one small form.
 *
 * WHAT IS SHOWN, AND HOW. An outlier's numbers sit beside the draft's own, in
 * the same ink, with no colour that implies the draft is losing. A
 * measurement that could not be made reads as "not measured", never as 0. The
 * results comparison says NOTHING until the server has five on each side of a
 * split, and when it does, the sample size is printed beside every number.
 */

const fmt = (v, unit = "") => (v == null ? "—" : `${Number(v).toFixed(v % 1 ? 1 : 0)}${unit}`);

function OutlierRow({ o, draft }) {
  const n = o.numbers || {};
  const label = o.video_id ? `${o.platform} · ${o.video_id}` : o.platform || "pasted transcript";
  if (n.status === "missing") {
    return (
      <li className="text-[12px] text-inkMuted">
        <span className="text-inkSoft">{label}</span> — not measured. {n.reason}
      </li>
    );
  }
  const cells = [
    ["hook closes", fmt(n.hook_seconds, "s"), null],
    ["first turn", fmt(n.first_rehook_seconds, "s"), draft?.first_device != null ? `~${fmt(draft.first_device, "s")}` : null],
    ["spread", fmt(n.sentence_length_sigma), draft?.sigma != null ? fmt(draft.sigma) : null],
    ["words/s", fmt(n.words_per_second), null],
    ["× channel", fmt(n.outlier_ratio), null],
  ];
  return (
    <li className="text-[12px]">
      <div className="text-inkSoft mb-1">{label}</div>
      <dl className="grid grid-cols-3 sm:grid-cols-5 gap-x-4 gap-y-1">
        {cells.map(([k, v, mine]) => (
          <div key={k}>
            <dt className="text-[10.5px] text-inkMuted">{k}</dt>
            <dd className="font-mono tabular-nums text-ink">
              {v}
              {mine != null && <span className="text-inkMuted"> · yours {mine}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

export default function ShortsPanel({ scriptId, rhythm }) {
  const [open, setOpen] = useState(null); // "outlier" | "result" | null
  const [outliers, setOutliers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({});

  const refresh = useCallback(() => {
    if (!scriptId) return;
    shortsApi.outliers(scriptId).then((r) => setOutliers(r.data.outliers || [])).catch(() => {});
    shortsApi.results().then((r) => setSummary(r.data)).catch(() => {});
  }, [scriptId]);

  useEffect(() => { refresh(); }, [refresh]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const num = (v) => (v === "" || v == null ? null : Number(v));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (open === "outlier") {
        await shortsApi.addOutlier(scriptId, {
          url: form.url || "", transcript: form.transcript || "",
          views: num(form.views), channel_median_views: num(form.median),
        });
      } else {
        await shortsApi.addResult(scriptId, {
          url: form.url || "", views: num(form.views) ?? 0,
          channel_median_views: num(form.median), retention_percent: num(form.retention),
        });
      }
      setForm({});
      setOpen(null);
      refresh();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save that. Your draft is untouched.");
    } finally {
      setBusy(false);
    }
  };

  const draft = rhythm && {
    sigma: rhythm.sentence_length_sigma,
    first_device: (rhythm.attention_devices || [])[0],
  };
  const input = "w-full bg-transparent border border-borderSoft rounded-md px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-gold/60";

  return (
    <div className="shrink-0 border-b border-border bg-surface/30 px-5 py-2" data-testid="shorts-panel">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        <button type="button" onClick={() => setOpen(open === "outlier" ? null : "outlier")}
          className="text-inkSoft hover:text-ink" aria-expanded={open === "outlier"}>
          Compare an outlier
        </button>
        <button type="button" onClick={() => setOpen(open === "result" ? null : "result")}
          className="text-inkSoft hover:text-ink" aria-expanded={open === "result"}>
          Log how it did
        </button>
        {summary?.results_logged > 0 && (
          <span className="text-inkMuted">{summary.results_logged} result{summary.results_logged === 1 ? "" : "s"} logged</span>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="mt-2 grid gap-2 max-w-2xl">
          <input aria-label="Video link" placeholder="Video link (optional)" className={input}
            value={form.url || ""} onChange={set("url")} />
          {open === "outlier" && (
            <textarea aria-label="Transcript" rows={4} className={input}
              placeholder="Paste the transcript with its timings — e.g. YouTube's “Show transcript”. Only the numbers are kept."
              value={form.transcript || ""} onChange={set("transcript")} />
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <input aria-label="Views" inputMode="numeric" placeholder={open === "result" ? "Views" : "Views (optional)"}
              className={input} value={form.views || ""} onChange={set("views")} required={open === "result"} />
            <input aria-label="Channel median views" inputMode="numeric" placeholder="Channel median views"
              className={input} value={form.median || ""} onChange={set("median")} />
            {open === "result" && (
              <input aria-label="Average percentage viewed" inputMode="decimal" placeholder="Avg % viewed"
                className={input} value={form.retention || ""} onChange={set("retention")} />
            )}
          </div>
          {error && <p className="text-[12px] text-red-300">{error}</p>}
          <div>
            <button type="submit" disabled={busy} className="btn-gold !py-1.5 !px-4 !text-[12.5px]">
              {busy ? "Saving…" : open === "outlier" ? "Measure" : "Save result"}
            </button>
          </div>
        </form>
      )}

      {outliers.length > 0 && (
        <ul className="mt-2 space-y-2.5">
          {outliers.slice(0, 3).map((o) => <OutlierRow key={o.id} o={o} draft={draft} />)}
        </ul>
      )}

      {(summary?.comparisons || []).length > 0 && (
        <ul className="mt-2 space-y-1 text-[12px] text-inkSoft" aria-label="What your results show">
          {summary.comparisons.map((c) => (
            <li key={c.split}>
              {c.label}: median <span className="font-mono text-ink">{c.with.median_ratio}×</span> your channel
              (n={c.with.n}) against <span className="font-mono text-ink">{c.without.median_ratio}×</span> without
              (n={c.without.n}). A comparison of your own posts, not a rule.
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
