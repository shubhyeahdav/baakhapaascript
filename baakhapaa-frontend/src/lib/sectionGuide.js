/**
 * One line of craft guidance per section kind.
 *
 * Shown beside the retrieved patterns when the caret is inside a section, so a
 * writer who has not asked anything still gets the one thing that section is
 * usually for. The retrieved craft answers "what technique helps"; this
 * answers "what is this section's job", which is the question a writer has
 * before they know they have a problem.
 *
 * WRITTEN AS A JOB, NOT AS A RULE. "Earn the next minute" is something a
 * writer can act on; "hooks should be 15 seconds" is a number pretending to be
 * craft, and this product already has enough numbers. Nothing here warns and
 * nothing is conditional on what is written — the same restraint
 * `SectionPacing` and `RetentionShape` keep.
 *
 * `proof` carries the one actual rule, and it is here because it is the
 * section writers most often get wrong in the same way: a testimonial is not
 * evidence. It is stated as what proof IS rather than as a prohibition,
 * because the useful half is knowing what to go and find.
 */

export const SECTION_GUIDE = {
  // --- video essay ------------------------------------------------------
  hook: {
    job: "Earn the next minute.",
    line: "Open on the thing that is strange, not on who you are or what the video will cover.",
  },
  promise: {
    job: "Say what they get.",
    line: "Name the specific thing they will know by the end. A vague promise is what a viewer leaves on.",
  },
  segment: {
    job: "Make one point, fully.",
    line: "One idea per segment, taken all the way. Two half-made points read as padding.",
  },
  payoff: {
    job: "Land the opening.",
    line: "Answer the question the hook asked, in the terms it asked it. A new idea here reads as a second video.",
  },
  cta: {
    job: "Ask once, small.",
    line: "One ask, stated plainly. A hard ask costs more reach than it gains.",
  },

  // --- course lesson ----------------------------------------------------
  objective: {
    job: "State what they will be able to do.",
    line: "A capability, not a topic: \"split a scene on its turn\", not \"scene structure\".",
  },
  concept: {
    job: "Explain the idea once.",
    line: "Give the idea a shape they can carry — a name, a contrast, or a single worked case.",
  },
  proof: {
    job: "Show that it holds.",
    // The rule the task list singles out, and the reason this map exists.
    line: "Proof is a measurement, never a quotation. Show the number, the before-and-after, or the counted cases — not someone saying it worked.",
  },
  exercise: {
    job: "Give them something to start.",
    line: "A task with a starting point in it. \"Try it yourself\" is not an exercise.",
  },
  check: {
    job: "Let them test themselves.",
    line: "Something the learner can judge without you. If only you can mark it, it is not a check.",
  },
};

/** The guidance for a section kind, or null. */
export const guideFor = (kind) => SECTION_GUIDE[kind] || null;
