import React, { useCallback, useEffect, useState } from "react";

/**
 * Page rules drawn over the screenplay page.
 *
 * The editor was one unbroken column, so a writer had no idea what page they
 * were on — and in this craft the page IS the unit of screen time. "Cut ten
 * pages" is a note you can act on; "cut some words" is not.
 *
 * The break rule is `screenplay.PAGE_LINES` from the server, which is the same
 * number the PDF export lays out with. Page 6 here is page 6 in the PDF, and
 * that only holds because neither side owns its own copy of the rule.
 *
 * Drawn as an overlay rather than by slicing the draft into separate page
 * elements: the writing surface stays one textarea, so selection, undo and
 * typing across a boundary all behave exactly as before.
 */
export default function PageBreaks({ textareaRef, content, pageLines = 45, scrollTop = 0 }) {
  const [metrics, setMetrics] = useState(null);

  // Read the real rendered geometry rather than duplicating the CSS here. Line
  // height is font-size × line-height and both are set in index.css; hardcoding
  // the product would break silently the first time either changed.
  const measure = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cs = window.getComputedStyle(ta);
    const lineHeight = parseFloat(cs.lineHeight);
    const paddingTop = parseFloat(cs.paddingTop);
    const paddingRight = parseFloat(cs.paddingRight);
    if (!lineHeight || Number.isNaN(lineHeight)) return;
    setMetrics({ lineHeight, paddingTop, paddingRight });
  }, [textareaRef]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  if (!metrics) return null;

  // Count the lines the writer actually typed. A soft-wrapped long line still
  // occupies more than one row on screen, so a very wide action paragraph will
  // drift the rule slightly — acceptable, because screenplay lines are short by
  // format and the alternative is measuring every wrapped row on every keypress.
  const totalLines = (content || "").split("\n").length;
  const pages = Math.max(1, Math.ceil(totalLines / pageLines));
  if (pages < 2) return null;

  const rules = [];
  for (let p = 1; p < pages; p += 1) {
    rules.push({
      page: p,
      top: metrics.paddingTop + p * pageLines * metrics.lineHeight - scrollTop,
    });
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {rules.map((r) => (
        <div key={r.page} className="absolute left-0 right-0" style={{ top: r.top }}>
          <div className="border-t border-dashed border-black/25 page-rule" />
          {/* The number belongs to the page BELOW the rule, and sits at its top
              right — the printed screenplay convention, and what a reader
              flipping to "page 4" is looking for. Labelling the rule with the
              page that just ended reads as an off-by-one to anyone used to a
              real script. */}
          <span
            className="absolute top-[3px] font-mono text-[9.5px] tracking-wider text-black/45 page-rule-label bg-[#FAF9F6] pl-2"
            style={{ right: metrics.paddingRight }}
          >
            {r.page + 1}.
          </span>
        </div>
      ))}
    </div>
  );
}
