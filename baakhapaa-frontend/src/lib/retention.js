/**
 * The shape of a long-form video: where its sections fall, and where attention
 * conventionally goes.
 *
 * A screenplay's instrument is act balance — `CompactTimeline` draws it. A
 * video essay has no acts. What it has is a runtime with known places people
 * leave, and sections that either sit well against those or do not. This is the
 * equivalent instrument, and it answers the most common long-form failure at a
 * glance: a forty-second hook and a twenty-second payoff.
 *
 * ON THE DROP-OFFS, HONESTLY
 * --------------------------
 * **The attention curve here is a convention, not a measurement.** Nothing in
 * this repository can observe how people watch a video — a writer's own
 * analytics would be a measurement and this is not. So the marks describe where
 * viewers are generally understood to leave, and the component says so on its
 * face.
 *
 * The rule is the one `MilestoneNote` already follows: it may show and point,
 * it must not assert a fault it cannot check. Nothing here says a hook is too
 * long. It says how long the hook is and where the drop conventionally falls,
 * and lets the writer draw the conclusion — which is also the only honest thing
 * to do, because a forty-second hook is wrong in most videos and exactly right
 * in some.
 */

// Where viewers are generally understood to leave. The early two are absolute
// — a thirty-second mark is thirty seconds whether the video runs eight minutes
// or twenty-five — and the midpoint is proportional, because that is what
// "middle" means.
//
// Deliberately three, not a curve. A drawn curve would imply a precision this
// has no basis for; three marked moments say the same useful thing and claim
// less.
export const ATTENTION_MARKS = [
  {
    key: "opening",
    atSeconds: 30,
    label: "0:30",
    note: "The steepest fall in most videos is in the first half minute.",
  },
  {
    key: "settled",
    atSeconds: 60,
    label: "1:00",
    note: "Whoever is still here at a minute usually stays a good while longer.",
  },
  {
    key: "midpoint",
    atFraction: 0.5,
    label: "midpoint",
    note: "A second, shallower fall tends to sit around the middle.",
  },
];

// The smallest share of the bar a section may take, so a fifteen-second hook in
// a twenty-five-minute video stays visible rather than collapsing to a hairline.
// `CompactTimeline` uses the same idea for the same reason.
const MIN_SHARE = 0.02;

/** A section's intended length: what was planned, or failing that what exists. */
export function sectionSeconds(section) {
  const target = Number(section?.target_seconds);
  if (Number.isFinite(target) && target > 0) return target;
  const written = Number(section?.written_seconds);
  return Number.isFinite(written) && written > 0 ? written : 0;
}

/**
 * Turn sections into bands across the runtime, plus the marks that fall inside
 * it.
 *
 * `sections` are `{ heading, section_kind, target_seconds, written_seconds }`,
 * which is the shape `videoscript.scene_summaries` produces once it reaches the
 * editor.
 */
export function shape(sections = []) {
  const usable = (sections || []).filter(Boolean);
  const lengths = usable.map(sectionSeconds);
  const total = lengths.reduce((n, s) => n + s, 0);

  if (!usable.length || total <= 0) {
    // Nothing planned and nothing written. An instrument with no reading should
    // show no reading — a bar of equal grey blocks would be an invented shape.
    return { total: 0, bands: [], marks: [] };
  }

  let cursor = 0;
  const bands = usable.map((section, index) => {
    const seconds = lengths[index];
    const start = cursor;
    cursor += seconds;
    const written = Number(section.written_seconds) || 0;
    return {
      key: `${index}-${section.heading || ""}`,
      heading: section.heading || "",
      kind: section.section_kind || "segment",
      seconds,
      writtenSeconds: written,
      startSeconds: start,
      // Share of the bar, floored so a short section stays visible.
      share: Math.max(MIN_SHARE, total ? seconds / total : 0),
      // Reported, never judged: "3:10 written against 3:00 planned" is a fact.
      // "Your segment is too long" is a claim this cannot support.
      overrunSeconds: section.target_seconds ? written - section.target_seconds : 0,
    };
  });

  const marks = ATTENTION_MARKS
    .map((mark) => {
      const at = mark.atSeconds != null ? mark.atSeconds : total * mark.atFraction;
      return { ...mark, atSeconds: at, position: at / total };
    })
    // A mark past the end of the video is not a mark. A ninety-second piece has
    // no one-minute-settled moment worth drawing at 67% of the bar and no
    // midpoint drop distinguishable from it.
    .filter((mark) => mark.position > 0 && mark.position < 1);

  return { total, bands, marks };
}

/** `195` -> `"3:15"`. Seconds, because a hook is 15 seconds, not 0.25 minutes. */
export function timecode(seconds) {
  const whole = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
