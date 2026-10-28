import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { lineTops } from "../lib/caretLine";

/**
 * The linter's notes, in the page's own margin.
 *
 * They lived only in the Craft tab, as "L13 · The character states the real
 * grievance out loud" — so a writer had to open a panel, read a line number,
 * and count down the page to find the sentence it meant. Every note here sits
 * beside the line it is about, which is where an editor's pencil puts it.
 *
 * QUIET BY DESIGN. A dot, not a highlight: the text is the writer's, and
 * painting it red would turn a judgement into an accusation. The note opens
 * only when asked, says what the linter saw and the technique that answers
 * it, and goes. Never in focus mode. Not below `md`, where the page's margin
 * shrinks to half a rem and has nowhere to hang anything — the Craft tab still has every note.
 *
 * Positioned like the focus band: over the textarea, measured through the
 * browser's own wrapping (`lineTops`), offset by the textarea's own scroll.
 */
const DOT = { high: "bg-[#C0563B]", medium: "bg-[#B8871E]", low: "bg-[#8B867A]" };
const RANK = { high: 0, medium: 1, low: 2 };

export default function PageNotes({ flags, textareaRef, content, onGoToLine, onOpenCraft, pageTheme }) {
  const [tops, setTops] = useState({});
  const [scroll, setScroll] = useState(0);
  const [open, setOpen] = useState(null);

  // One marker per line, carrying every note on it, worst first.
  const byLine = useMemo(() => {
    const m = new Map();
    for (const f of flags || []) {
      if (!Number.isFinite(f.line)) continue;
      m.set(f.line, [...(m.get(f.line) || []), f]);
    }
    return [...m.entries()]
      .map(([line, fs]) => [line, fs.sort((a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3))]);
  }, [flags]);

  const measure = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    setTops(lineTops(ta, byLine.map(([line]) => line)));
    setScroll(ta.scrollTop);
  }, [textareaRef, byLine]);

  useLayoutEffect(() => { measure(); }, [measure, content]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return undefined;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScroll(ta.scrollTop));
    };
    const onResize = () => measure();
    ta.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    return () => {
      ta.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frame);
    };
  }, [textareaRef, measure]);

  // A note whose line has gone (deleted, or the flags are a beat behind the
  // draft) closes rather than pointing at nothing.
  useEffect(() => {
    if (open != null && !byLine.some(([line]) => line === open)) setOpen(null);
  }, [byLine, open]);

  if (!byLine.length) return null;
  // Markers scrolled out of the page's box are hidden. With no measurable
  // height (no layout at all) nothing can be known to be out of view.
  const height = textareaRef.current?.clientHeight || Infinity;
  const card = pageTheme === "dark"
    ? "bg-elevated border-border text-ink"
    : "bg-white border-[#E4E0D6] text-[#1E1E20] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]";

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden hidden md:block" data-testid="page-notes">
      {byLine.map(([line, fs]) => {
        const top = tops[line];
        if (top == null) return null;
        const y = top - scroll;
        if (y < 0 || y > height - 8) return null;
        const worst = fs[0].severity;
        const isOpen = open === line;
        const label = `Line ${line}: ${fs.map((f) => f.message).join(" ")}`;
        return (
          <div key={line} className="absolute left-0" style={{ top: y }}>
            <button
              type="button"
              aria-label={label}
              aria-expanded={isOpen}
              title={fs[0].message}
              onClick={() => setOpen(isOpen ? null : line)}
              className="pointer-events-auto absolute left-5 top-[0.45em] h-6 w-6 -mt-[6px] flex items-center justify-center rounded-full hover:bg-black/5"
            >
              <span className={`block h-2 w-2 rounded-full ${DOT[worst] || DOT.low} ${fs.length > 1 ? "ring-2 ring-offset-1 ring-current opacity-90" : ""}`} />
            </button>
            {/* Opens BELOW its line, never on it: the note is about that
                sentence, and covering it made the writer close the note to
                read what it was talking about. */}
            {isOpen && (
              <div
                role="dialog"
                aria-label={`Notes on line ${line}`}
                className={`pointer-events-auto absolute left-12 top-[1.9em] w-[19rem] max-w-[60vw] rounded-xl border p-3.5 z-20 font-sans ${card}`}
              >
                <ul className="space-y-2.5">
                  {fs.map((f, i) => (
                    <li key={`${f.rule}-${i}`}>
                      <p className="text-[12.5px] leading-snug">{f.message}</p>
                      {f.technique && (
                        <p className={`text-[12px] leading-snug mt-1 ${pageTheme === "dark" ? "text-gold" : "text-[#8A6A18]"}`}>→ {f.technique}</p>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-3 mt-3 text-[11.5px]">
                  <button type="button" className="underline decoration-dotted underline-offset-2 opacity-80 hover:opacity-100"
                    onClick={() => { setOpen(null); onGoToLine && onGoToLine(line); }}>
                    Go to the line
                  </button>
                  <button type="button" className="underline decoration-dotted underline-offset-2 opacity-80 hover:opacity-100"
                    onClick={() => { setOpen(null); onOpenCraft && onOpenCraft(); }}>
                    Why, and how to fix it
                  </button>
                  <button type="button" aria-label="Close" className="ml-auto opacity-60 hover:opacity-100"
                    onClick={() => setOpen(null)}>
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
