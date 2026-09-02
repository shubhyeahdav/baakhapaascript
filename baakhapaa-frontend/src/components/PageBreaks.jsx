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
  const lines = (content || "").split("\n");
  const totalLines = lines.length;
  const pages = Math.max(1, Math.ceil(totalLines / pageLines));
  if (pages < 2) return null;

  /**
   * Where the break actually goes.
   *
   * Never mid-element. A screenplay does not split a scene heading from its
   * action, or a character cue from the line under it — real paginating
   * software pushes the break back to the nearest element boundary, and a
   * blank line is exactly what an element boundary looks like in this format.
   *
   * It also solves the thing that made a drawn gap unusable: on a blank line
   * the break covers nothing, so it can be solid paper-to-paper instead of a
   * translucent band sitting over the writer's words.
   *
   * Search backwards only, and no further than SNAP_LIMIT. Forwards would put
   * more on the page than fits; further back throws away too much of it, and
   * at that point breaking mid-element is the lesser damage.
   */
  const SNAP_LIMIT = 4;
  const breakAt = (nominal) => {
    for (let i = 0; i <= SNAP_LIMIT; i += 1) {
      if ((lines[nominal - 1 - i] ?? "").trim() === "") return nominal - i;
    }
    return nominal;
  };

  const rules = [];
  for (let p = 1; p < pages; p += 1) {
    const line = breakAt(p * pageLines);
    rules.push({
      page: p,
      top: metrics.paddingTop + line * metrics.lineHeight - scrollTop,
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
