import React from "react";
import { sectionAt } from "../utils/videoFormat";
import { kindOf, modeOf } from "../utils/videoSections";
import { timecode } from "../lib/retention";

/**
 * Where the caret is, in the terms this format actually uses.
 *
 * A screenplay's status line says `p. 4 / 12` because the page is the unit of
 * screen time in that craft. A video script has no pages — runtime is words
 * over a speaking rate — so the same readout on a video draft reports a number
 * that means nothing, computed from a page length that does not apply.
 *
 * What a video writer wants instead is the section they are in and how much of
 * its time they have used. That is the format's own unit, and it is the number
 * that decides whether the thing works: the format's most common failure is a
 * forty-second hook, and a writer only notices while they are writing it.
 *
 * IT REPORTS AND NEVER JUDGES. No badge when a section runs long, no colour
 * change, no warning, nothing blocked. This follows `RetentionShape` and
 * `MilestoneNote`, and a test pins it: a section at triple its target reads
 * exactly like one under it, only with different numbers. The writer who ran
 * long usually meant to, and a product that flinches every time they do is one
 * they turn off.
 *
 * NO TARGET IN COURSE MODE, because there is none. `videoscript` leaves
 * `time_allocation` null for a lesson and `RetentionShape` is suppressed there
 * for the same reason: a learner who has already committed is not deciding
 * second by second whether to stay, so a target would be a number invented to
 * fill a column.
 */

/** Seconds of narration, from the same rule `videoscript.runtime_seconds` uses. */
export function spokenSeconds(words, wpm) {
  const rate = Number(wpm) > 0 ? Number(wpm) : 150;
  return Math.round((Number(words) || 0) / rate * 60);
}

export default function SectionPacing({
  content, caretLine, videoCategory, speakingWpm, className = "",
}) {
  const section = sectionAt(content, caretLine);
  if (!section) return null;

  const mode = modeOf(videoCategory);
  const kind = kindOf(section.name, mode);
  const written = spokenSeconds(section.wordsBefore, speakingWpm);

  // A target only when the writer wrote one AND the format has them. A course
  // heading can carry `- 2:00` if someone types it; the mode decides whether
  // it means anything, not the presence of the digits.
  const target = mode === "course" ? null : section.targetSeconds;

  return (
    <span className={`tabular-nums ${className}`} data-testid="section-pacing">
      <span className="uppercase tracking-[0.08em]">{section.name}</span>
      {kind && kind !== section.name.toLowerCase() && (
        <span className="sr-only"> ({kind})</span>
      )}
      <span className="ml-2">
        {timecode(written)}
        {target ? ` of ${timecode(target)}` : " written"}
      </span>
    </span>
  );
}
