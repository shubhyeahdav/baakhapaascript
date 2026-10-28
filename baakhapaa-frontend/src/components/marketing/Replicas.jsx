import React from "react";

/**
 * Small HTML replicas of real screens, shared by `/` and `/tour`.
 *
 * Replicas rather than screenshots: they stay sharp at any size, read in
 * Devanagari, cost no download, and cannot go stale the way a captured image
 * does — when a screen changes, the one copy here is the one to change. Each
 * draws something the product does today; none is a mock-up of a feature
 * that does not exist.
 */

export function KeysVisual() {
  const rows = [["i", "INT."], ["Tab", "SITA"], ["(", "(beat)"], ["d", "DAY"]];
  return (
    <div className="rounded-xl border border-borderSoft bg-surface p-4 font-mono text-[12.5px] space-y-2">
      {rows.map(([k, out]) => (
        <div key={k} className="flex items-center gap-3">
          <kbd className="min-w-[44px] text-center px-2 py-1 rounded-md border border-border bg-bgDeep text-inkSoft">{k}</kbd>
          <span className="text-inkMuted">→</span>
          <span className="text-ink">{out}</span>
        </div>
      ))}
      <div className="pt-2 mt-2 border-t border-borderSoft text-inkMuted text-[11.5px]">p. 6 / 98 — the PDF's page</div>
    </div>
  );
}

export function MarginVisual() {
  return (
    <div className="rounded-xl bg-[#FAF9F6] p-4 pl-10 font-mono text-[12px] text-[#1B1A17] relative leading-[1.9]">
      <span className="absolute left-4 top-[1.55rem] h-2 w-2 rounded-full bg-[#B8871E]" aria-hidden="true" />
      <span className="absolute left-4 top-[3.45rem] h-2 w-2 rounded-full bg-[#C0563B]" aria-hidden="true" />
      <p className="pl-[22%]">(रिसाएर)</p>
      <p className="pl-[12%]">तिमीले कहिल्यै मेरो कुरा सुनेनौ।</p>
      <div className="mt-3 ml-[12%] rounded-lg bg-white border border-[#E4E0D6] p-2.5 font-sans text-[11.5px] leading-snug shadow-sm max-w-[16rem]">
        The character states the real grievance out loud.
        <span className="block text-[#8A6A18] mt-1">→ Let them fight about the small wrong thing</span>
      </div>
    </div>
  );
}

export function LessonVisual() {
  return (
    <div className="rounded-xl border border-borderSoft bg-surface p-4">
      <p className="text-[10px] tracking-[0.16em] uppercase text-inkMuted latin-caps">The page · 1 / 19</p>
      <p className="font-display text-[19px] text-ink mt-1">स्क्रिनप्ले भनेको के हो</p>
      <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
        <p className="text-[12.5px] text-amber-300 font-semibold">अझै भएन।</p>
        <p className="text-[12px] text-inkSoft mt-1">— 0 वटा scene heading भेटियो; यो अभ्यासलाई 1 चाहिन्छ।</p>
      </div>
    </div>
  );
}

export function PlanVisual() {
  const cards = [["1", "INT. CHIYA PASAL - DAY", "सुनिता · राजा"], ["2", "EXT. BAGMATI BRIDGE - DUSK", "राजा"], ["3", "INT. BUS PARK - NIGHT", "सुनिता"]];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map(([n, slug, cast]) => (
        <div key={n} className="rounded-lg border border-borderSoft bg-surface p-2.5 min-w-0">
          <p className="text-[9.5px] font-mono text-gold">SCENE {n}</p>
          <p className="text-[10.5px] font-mono text-inkSoft truncate mt-0.5">{slug}</p>
          <div className="mt-2 h-10 rounded border border-borderSoft bg-[radial-gradient(ellipse_at_30%_70%,rgba(212,168,67,0.18),transparent_60%),linear-gradient(180deg,#191813,#0B0B0A)]" aria-hidden="true" />
          <p className="text-[10px] text-gold/70 mt-1.5 truncate">{cast}</p>
        </div>
      ))}
    </div>
  );
}

export function VideoVisual() {
  const beats = [["Hook", 10], ["Escalation", 40], ["Payoff", 27], ["Twist", 14], ["CTA", 9]];
  const ticks = [16, 31, 44, 60, 76];
  return (
    <div className="rounded-xl border border-borderSoft bg-surface p-4">
      <div className="relative flex h-8 rounded overflow-hidden border border-border">
        {beats.map(([name, w], i) => (
          <div key={name} style={{ width: `${w}%` }} className={`flex items-center px-1.5 text-[10px] text-inkSoft border-r border-border last:border-r-0 ${i === 0 ? "bg-gold/30" : "bg-elevated/50"}`}>
            <span className="truncate">{name}</span>
          </div>
        ))}
        {ticks.map((x) => (
          <span key={x} className="absolute top-0 bottom-0 w-px bg-gold/50" style={{ left: `${x}%` }} aria-hidden="true" />
        ))}
      </div>
      <p className="mt-3 text-[11.5px] text-inkSoft">
        RHYTHM · sentence lengths vary by <span className="font-mono text-ink">6.2</span> words · about <span className="font-mono text-ink">44</span>s spoken
      </p>
    </div>
  );
}

// Other software is named only where a FILE we export opens in it.
export const TRAVELS = [
  ["Final Draft", ".fdx"],
  ["Celtx", ".fdx"],
  ["Arc Studio", ".fdx"],
  ["Word", ".docx"],
  ["Any reader", "PDF"],
  ["A production", "package PDF"],
];
