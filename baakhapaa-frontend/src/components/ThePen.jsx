import React from "react";

/**
 * The Pen — the guide who teaches the script page.
 *
 * The course was excellent and lived on a screen nothing routed anyone to. A
 * writer signed up, answered four questions and was dropped into a blank
 * editor; the nineteen lessons that would have taught them what to do with it
 * were behind a nav item they had no reason to press. So the Pen comes to
 * them, during onboarding, and teaches the first lesson before they ever see
 * the editor.
 *
 * WHY A NIB AND NOT A FACE. Duolingo's owl works because language learning is
 * social and a creature can be encouraging about it. This is a craft tool for
 * people who take the work seriously, and a cartoon character congratulating a
 * screenwriter reads as condescension fast. The nib is the instrument itself —
 * present, expressive through posture rather than expression, and impossible to
 * find patronising. It is also already the product's name for this track.
 *
 * Mood changes the nib's angle and the ink, never adds a face:
 *   idle      — upright, waiting
 *   thinking  — tilted, mid-question
 *   pleased   — upright with the ink caught mid-flourish
 *   nudging   — tilted down, about to correct something
 */

const MOODS = {
  idle: { rotate: 0, drop: 1, flourish: 0 },
  thinking: { rotate: -12, drop: 0.55, flourish: 0 },
  pleased: { rotate: 4, drop: 1, flourish: 1 },
  nudging: { rotate: 10, drop: 0.75, flourish: 0 },
};

/**
 * `decorative` matters more than it looks. Where the Pen IS the speaker —
 * onboarding — it earns an accessible name. Where it only accompanies text that
 * already says the same thing, announcing "The Pen, nudging" reads out an
 * illustration and then repeats the sentence beside it. So a placement declares
 * which one it is rather than every Pen defaulting to being announced.
 */
export default function ThePen({
  mood = "idle",
  size = 64,
  className = "",
  decorative = false,
}) {
  const { rotate, drop, flourish } = MOODS[mood] || MOODS.idle;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={`the-pen the-pen--${mood} ${className}`}
      {...(decorative
        ? { "aria-hidden": "true" }
        : { role: "img", "aria-label": `The Pen, ${mood}` })}
      style={{ transform: `rotate(${rotate}deg)`, transition: "transform .45s ease" }}
    >
      {/* Barrel */}
      <path
        d="M32 6 L40 22 L40 40 L24 40 L24 22 Z"
        fill="currentColor"
        opacity="0.16"
      />
      {/* Nib — the shape that reads as a pen at 24px as well as at 96px */}
      <path
        d="M32 40 L24 22 L32 6 L40 22 Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* The slit, which is what makes a nib a nib */}
      <path d="M32 14 L32 40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* The breather hole */}
      <circle cx="32" cy="26" r="2.6" fill="currentColor" />

      {/* Ink, gathering at the tip. Fades as the Pen "thinks". */}
      <circle
        cx="32" cy="46" r="3.4"
        fill="currentColor"
        opacity={drop}
        style={{ transition: "opacity .45s ease" }}
      />

      {/* A single stroke of ink, drawn only when pleased. One flourish, not
          confetti — the reward for writing a correct slugline should look like
          writing, not like a slot machine. */}
      <path
        d="M18 55 C24 50, 40 50, 46 55"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity={flourish}
        style={{
          strokeDasharray: 40,
          strokeDashoffset: flourish ? 0 : 40,
          transition: "stroke-dashoffset .6s ease, opacity .3s ease",
        }}
      />
    </svg>
  );
}
