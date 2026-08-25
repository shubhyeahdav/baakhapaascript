import React, { useEffect, useState } from "react";
import { GUIDES, GUIDE_GROUPS, guideProgress } from "../utils/guides";

/**
 * The guide. Always available, never modal, and it works on your own script.
 *
 * The product's pitch is that it guides a writer through the decisions a blank
 * page does not — and what it shipped was a blank page with a line of
 * formatting jargon on it. The fourteen-lesson course exists and is good, and
 * nothing routes anyone to it; you have to already know it is there.
 *
 * So this is not a first-run tour that fires once and disappears, and not a
 * help menu. It is a shelf of short walkthroughs, reachable at any moment from
 * the toolbar, each performed in the draft the writer already has open. A step
 * that asks for something checks the draft for it rather than waiting on a Next
 * button, so the guide knows when you have actually done the thing.
 *
 * Deliberately a side panel and not an overlay with spotlights: a writer needs
 * to be able to read the instruction and type at the same time, and anything
 * that dims the page to point at a button is unusable the moment you want to
 * work while it is open.
 */

function StepCheck({ done, label }) {
  return (
    <div
      className={`flex items-start gap-2 mt-3 rounded-lg border p-2.5 ${
        done
          ? "border-emerald-400/30 bg-emerald-400/5"
          : "border-borderSoft bg-bgDeep/40"
      }`}
    >
      <span
        className={`text-[11px] mt-px ${done ? "text-emerald-400" : "text-inkMuted"}`}
        aria-hidden="true"
      >
        {done ? "✓" : "○"}
      </span>
      <span className={`text-[11.5px] leading-snug ${done ? "text-emerald-300" : "text-inkMuted"}`}>
        {done ? `Done — ${label}` : `Waiting for ${label}`}
      </span>
    </div>
  );
}

function Running({ guide, content, onExit, onInsert }) {
  const [index, setIndex] = useState(0);
  const step = guide.steps[index];
  const last = index === guide.steps.length - 1;
  const satisfied = step.check ? step.check(content || "") : true;

  // Move on by itself once the writer does the thing. Waiting for Next after
  // the work is already done makes the guide feel like paperwork.
  useEffect(() => {
    if (!step.check || !satisfied || last) return;
    const timer = setTimeout(() => setIndex((i) => (i === index ? i + 1 : i)), 900);
    return () => clearTimeout(timer);
  }, [satisfied, step, index, last]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onExit}
          className="text-[11px] text-inkMuted hover:text-gold transition-colors"
        >
          ← All guides
        </button>
        <span className="ml-auto font-mono text-[10px] text-inkMuted">
          {index + 1} / {guide.steps.length}
        </span>
      </div>

      <div className="flex gap-1 mb-4" aria-hidden="true">
        {guide.steps.map((_, i) => (
          <span
            key={i}
            className={`h-[3px] flex-1 rounded-full transition-colors ${
              i <= index ? "bg-gold" : "bg-borderSoft"
            }`}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <h3 className="font-display text-[17px] text-ink mb-2 leading-snug">{step.title}</h3>
        <div className="text-[12.5px] text-inkSoft leading-relaxed whitespace-pre-line">
          {step.body}
        </div>

        {step.does && (
          <div className="mt-3">
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-1">
              Like this
            </p>
            <pre className="font-mono text-[11.5px] text-gold/90 bg-bgDeep/50 border border-borderSoft rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed">
              {step.does}
            </pre>
            {onInsert && (
              // Offered, never done for them. A guide that writes the scene has
              // taught nothing — but a writer stuck on the shape of a slugline
              // is helped enormously by having one to edit.
              <button
                onClick={() => onInsert(step.does)}
                className="mt-1.5 text-[10.5px] text-inkMuted hover:text-gold transition-colors underline decoration-dotted underline-offset-2"
              >
                Put this in my script to edit
              </button>
            )}
          </div>
        )}

        {step.check && <StepCheck done={satisfied} label={step.checkLabel} />}
      </div>

      <div className="flex gap-2 pt-4 mt-2 border-t border-borderSoft">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="text-xs py-1.5 px-3 rounded-lg border border-border text-inkMuted hover:text-ink disabled:opacity-40"
        >
          Back
        </button>
        {last ? (
          <button
            onClick={onExit}
            className="flex-1 text-xs py-1.5 px-3 rounded-lg bg-goldDim border border-gold/40 text-gold"
          >
            Finish
          </button>
        ) : (
          <button
            onClick={() => setIndex((i) => i + 1)}
            className="flex-1 text-xs py-1.5 px-3 rounded-lg border border-border text-inkSoft hover:text-ink"
          >
            {step.check && !satisfied ? "Skip this step" : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function GuidePanel({ content, onInsert, onClose }) {
  const [activeId, setActiveId] = useState(null);
  const active = GUIDES.find((g) => g.id === activeId);

  if (active) {
    return (
      <Running
        guide={active}
        content={content}
        onExit={() => setActiveId(null)}
        onInsert={onInsert}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-start gap-2 mb-4">
        <div>
          <h3 className="font-display text-[17px] text-ink leading-snug">Guides</h3>
          <p className="text-[11.5px] text-inkMuted mt-0.5 leading-snug">
            Short walkthroughs, done in your own script. Come back any time.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close guides"
            className="ml-auto text-inkMuted hover:text-ink text-sm"
          >
            ✕
          </button>
        )}
      </div>

      {GUIDE_GROUPS.map((group) => {
        const inGroup = GUIDES.filter((g) => g.group === group);
        if (!inGroup.length) return null;
        return (
          <div key={group} className="mb-5">
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-inkMuted mb-1.5">
              {group}
            </p>
            <div className="space-y-1.5">
              {inGroup.map((guide) => {
                const progress = guideProgress(guide, content);
                const complete = progress && progress.done === progress.total;
                return (
                  <button
                    key={guide.id}
                    onClick={() => setActiveId(guide.id)}
                    className="w-full text-left rounded-lg border border-borderSoft bg-elevated/40 hover:border-gold/30 p-2.5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] text-ink">{guide.title}</span>
                      {complete && (
                        <span className="text-[10px] text-emerald-400" title="Your draft already does this">
                          ✓
                        </span>
                      )}
                      <span className="ml-auto font-mono text-[10px] text-inkMuted shrink-0">
                        {guide.minutes} min
                      </span>
                    </div>
                    <p className="text-[11px] text-inkMuted mt-0.5 leading-snug">{guide.blurb}</p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
