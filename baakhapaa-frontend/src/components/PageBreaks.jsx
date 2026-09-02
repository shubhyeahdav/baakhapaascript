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
      {/* A break between two sheets, not a line drawn on one.
          Each is the bottom edge of the page above and the top edge of the one
          below, with the app's own background showing through between them —
          the Google Docs reading, where a document is a stack of paper rather
          than an endless roll with marks on it. */}
      {rules.map((r) => (
        <div
          key={r.page}
          className="absolute left-0 right-0 page-break"
          style={{ top: r.top }}
        >
          <div className="page-break-edge page-break-edge--bottom" />
          <div className="page-break-gap">
            {/* The number belongs to the page BELOW, at its top right — the
                printed screenplay convention, and what a reader flipping to
                "page 4" is looking for. Labelling the break with the page that
                just ended reads as an off-by-one to anyone used to a script. */}
            <span
              className="page-break-number"
              style={{ right: metrics.paddingRight }}
            >
              {r.page + 1}.
            </span>
          </div>
          <div className="page-break-edge page-break-edge--top" />
        </div>
      ))}
    </div>
  );
}
