import React from "react";

// Compact act/scene timeline — the "instrument, not diagram" strip from design
// 2b. This is what the structure panel collapses into: the writer keeps a
// constant read on act balance and runtime without the full card view taking
// half the screen.
//
// Blocks are proportional to each scene's time allocation. Written (added)
// scenes render solid and are clickable; suggestions not yet added render as
// dashed "outline only" blocks, exactly as 2b treats unwritten scenes.

function timecode(mins) {
  const m = Math.floor(mins || 0);
  const s = Math.round(((mins || 0) - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const ROMAN = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V" };
const TICKS = 7;

export default function CompactTimeline({
  scenes = [],
  suggestions,
  activeScene,
  onSceneClick,
  onExpand,
}) {
  // Short-form has beats, not acts. Rather than returning null — which left
  // the minimized strip blank for every short-form project — collapse to a
  // one-line beat bar so runtime and shape stay visible while writing.
  if (suggestions?.short_form) {
    const beats = suggestions.beats || [];
    const total = suggestions.total_seconds || 1;
    return (
      <button
        onClick={onExpand}
        title="Expand the beat sheet"
        className="shrink-0 w-full border-b border-border bg-surface/60 px-5 py-2.5 text-left hover:bg-surface/80 transition-colors"
      >
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-inkMuted">
            {suggestions.category?.replace("_", " ")} · {beats.length} beats
          </span>
          <span className="font-mono text-[9.5px] text-inkMuted">{total}s</span>
        </div>
        <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden">
          {beats.map((b, i) => (
            <div
              key={b.beat_number}
              title={`${b.name} · ${b.duration_seconds}s`}
              style={{ width: `${(b.duration_seconds / total) * 100}%` }}
              className={i === 0 ? "bg-gold/70" : i < 3 ? "bg-gold/40" : "bg-inkMuted/30"}
            />
          ))}
        </div>
      </button>
    );
  }

  const sugActs = suggestions?.acts || [];
  const addedKeys = new Set(scenes.map((s) => `${s.act_number}:${s.title}`));

  const actNumbers = [
    ...new Set([...scenes.map((s) => s.act_number), ...sugActs.map((a) => a.act_number)]),
  ].sort((a, b) => a - b);
  if (actNumbers.length === 0) return null;

  const acts = actNumbers.map((num) => {
    const written = scenes
      .filter((s) => s.act_number === num)
      .map((s) => ({
        key: `w-${s.id}`,
        label: s.title,
        mins: s.time_allocation || 0,
        written: true,
        index: scenes.indexOf(s),
      }));
    const sugAct = sugActs.find((a) => a.act_number === num);
    const pending = (sugAct?.scenes || [])
      .filter((sc) => !addedKeys.has(`${num}:${sc.title}`))
      .map((sc, i) => ({
        key: `p-${num}-${i}`,
        label: sc.title,
        mins: sc.time_allocation || 0,
        written: false,
        index: null,
      }));
    return { num, name: sugAct?.name || "", blocks: [...written, ...pending] };
  });

  const total =
    acts.reduce((n, a) => n + a.blocks.reduce((m, b) => m + b.mins, 0), 0) || 1;
  const writtenMins = scenes.reduce((n, s) => n + (s.time_allocation || 0), 0);

  // Playhead sits at the start of the active scene's block.
  let cum = 0;
  let playheadPct = null;
  for (const a of acts) {
    for (const b of a.blocks) {
      if (b.written && b.index === activeScene) {
        playheadPct = (cum / total) * 100;
        break;
      }
      cum += b.mins;
    }
    if (playheadPct !== null) break;
  }

  const ticks = Array.from({ length: TICKS }, (_, i) => timecode((total * i) / (TICKS - 1)));

  return (
    <div className="shrink-0 border-b border-border px-[18px] pb-2.5">
      {/* Timecode ruler */}
      <div className="flex justify-between font-mono text-[9.5px] text-inkMuted/60 pt-1.5 pb-1">
        {ticks.map((t, i) => <span key={i}>{t}</span>)}
      </div>

      {/* Tick strip */}
      <div
        className="h-[3px] mb-1.5"
        style={{
          background:
            "repeating-linear-gradient(90deg, rgba(255,255,255,.14) 0 1px, transparent 1px 8.33%)",
        }}
      />

      {/* Scene blocks — proportional to runtime, act dividers between acts */}
      <div className="flex gap-[2px] h-[26px] relative">
        {acts.map((act, ai) => (
          <React.Fragment key={act.num}>
            {ai > 0 && <div className="w-px bg-white/20 shrink-0" />}
            {act.blocks.map((b) => {
              const isActive = b.written && b.index === activeScene;
              const common =
                "flex items-center px-2 text-[10.5px] min-w-0 overflow-hidden whitespace-nowrap transition-colors";
              const style = { flex: `${Math.max(b.mins, 0.4)} 1 0%` };
              return b.written ? (
                <button
                  key={b.key}
                  onClick={() => onSceneClick?.(b.index)}
                  title={`${b.label} · ${timecode(b.mins)}`}
                  style={style}
                  className={`${common} relative text-left ${
                    isActive
                      ? "bg-[#2A2312] border-t-2 border-gold text-ink"
                      : "bg-elevated text-inkMuted hover:text-ink"
                  }`}
                >
                  <span className="truncate">{b.index + 1} {b.label}</span>
                  {isActive && (
                    <span className="absolute right-1.5 font-mono text-gold">
                      {timecode(b.mins)}
                    </span>
                  )}
                </button>
              ) : (
                <button
                  key={b.key}
                  onClick={onExpand}
                  title={`${b.label} · outline only — click to add from the structure panel`}
                  style={style}
                  className={`${common} text-left bg-[#121110] border border-dashed border-white/10 text-inkMuted/50 hover:border-gold/30`}
                >
                  <span className="truncate italic">{b.label}</span>
                </button>
              );
            })}
          </React.Fragment>
        ))}

        {/* Playhead */}
        {playheadPct !== null && (
          <div
            className="absolute -top-[9px] -bottom-1 w-px bg-gold pointer-events-none"
            style={{ left: `${playheadPct}%` }}
          >
            <span className="absolute -top-1 -left-[3.5px] w-2 h-2 bg-gold rotate-45" />
          </div>
        )}
      </div>

      {/* Act labels + written-of-total */}
      <div className="flex justify-between text-[10px] text-inkMuted/60 mt-1.5">
        {acts.map((a) => (
          <span key={a.num}>
            ACT {ROMAN[a.num] || a.num}{a.name ? ` — ${a.name.toUpperCase()}` : ""}
          </span>
        ))}
        <span className="font-mono">
          {timecode(writtenMins)} written of {timecode(total)}
        </span>
      </div>
    </div>
  );
}
