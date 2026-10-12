/**
 * The cards between the footage.
 *
 * Built in the product's own tokens — warm near-black, true gold, Spectral and
 * Mukta — because a pitch video and the app it is pitching should not look like
 * two different products. The values are the ones in `tailwind.config.js`; if
 * the theme moves, these are the copy to update.
 *
 * Every claim here is sourced in `DEMO_VIDEO_SCRIPT.md`. Nothing is on a card
 * that is not either counted from the repository or measured by a script in it.
 */

export const THEME = {
  bg: "#0B0B0A",
  bgDeep: "#080807",
  surface: "#141311",
  gold: "#D4A843",
  goldBright: "#E4BE64",
  ink: "#EDEAE3",
  inkSoft: "#9B968A",
  inkMuted: "#7E7A6F",
};

/**
 * `kicker` is the small gold line, `lines` the claim, `foot` the quiet
 * qualifier under it. `stats` renders as a row of figures instead of prose.
 */
export const CARDS = [
  {
    id: "01-gap",
    seconds: 5.5,
    kicker: "Baakhapaa",
    lines: ["Nepal writes.", "Its writing tools", "do not read Nepali."],
    foot: "Screenwriting software checks craft in English. A Devanagari page is characters it cannot parse.",
  },
  {
    id: "02-linter",
    seconds: 4.5,
    kicker: "What we built",
    lines: ["The craft linter", "reads Devanagari."],
    foot: "On-the-nose dialogue · emotional parentheticals · a scene that opens on a greeting\nDeterministic. No AI call. Works on a half-written page.",
  },
  {
    id: "03-craft",
    seconds: 4.5,
    kicker: "Craft, retrieved",
    lines: ["45 craft entries.", "Matched by meaning,", "not by keyword."],
    foot: "Embedded locally — no API key, no per-query cost. Every worked example is original prose.",
  },
  {
    id: "04-course",
    seconds: 4.5,
    kicker: "The course",
    lines: ["19 lessons, free", "on every tier."],
    foot: "Graded by the craft linter, not by a Next button.\nTwo tracks, because page craft and story craft fail independently.",
  },
  {
    id: "05-video",
    seconds: 4.5,
    kicker: "A fourth format",
    lines: ["Long-form video,", "written section-first."],
    foot: "Sections live in the document, so they survive export, diff and reorder.\nRuntime is words over a speaking rate — not pages.",
  },
  {
    id: "06-moat",
    seconds: 9,
    kicker: "Why it is hard to copy",
    lines: ["The obvious fix", "did not work.", "We measured that."],
    body: [
      ["16.7%", "precision@1 for a Nepali craft query"],
      ["0.02", "the embedding model's same-meaning gap on Devanagari"],
      ["90.0%", "after translating out of Nepali before embedding"],
    ],
    foot: "A Nepali gloss field looked like the answer. The model scores two Devanagari sentences at 0.898 same-meaning against 0.877 different-meaning — it cannot read the script at all. CI fails below 0.85.",
  },
  {
    id: "07-economics",
    seconds: 6,
    kicker: "Unit economics",
    lines: ["The free tier costs", "nothing to serve."],
    foot: "Craft retrieval runs on local embeddings. Linting, review, camera notes and the whole course are deterministic.\n\nKhalti and eSewa, not just Stripe — Stripe cannot collect from most Nepali cards.",
  },
  {
    id: "08-standing",
    seconds: 7,
    kicker: "Where it stands",
    lines: ["Deployed.", "2,602 automated tests."],
    body: [
      ["1,187", "backend tests, 80 files"],
      ["1,415", "frontend tests, 70 files"],
      ["45 / 19", "craft entries / lessons"],
    ],
    foot: "Not yet proven: no completed payment, no writer trial, legal documents unreviewed.",
  },
  {
    id: "09-end",
    seconds: 4,
    kicker: "",
    lines: ["Baakhapaa"],
    foot: "baakhapaascript.vercel.app",
    end: true,
  },
];

/** One card as a full 1920x1080 document. */
export function cardHtml(card) {
  const t = THEME;
  const lines = card.lines
    .map((l) => `<div class="line">${l}</div>`)
    .join("");

  const body = card.body
    ? `<div class="stats">${card.body
        .map(
          ([fig, label]) =>
            `<div class="stat"><div class="fig">${fig}</div><div class="lab">${label}</div></div>`,
        )
        .join("")}</div>`
    : "";

  // `foot` carries deliberate newlines; blank lines become paragraph breaks so
  // the two halves of a card like 07 do not run together.
  const foot = card.foot
    ? `<div class="foot">${card.foot
        .split("\n\n")
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("")}</div>`
    : "";

  return `<!doctype html>
<meta charset="utf-8">
<title>${card.id}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@300;400;600&family=Mukta:wght@300;400;600&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1920px; height: 1080px; overflow: hidden; }
  body {
    background: ${card.end ? t.bgDeep : t.bg};
    color: ${t.ink};
    /* Georgia and Segoe UI are the fallbacks that matter: if the font request
       fails the card must still be a card rather than Times New Roman. */
    font-family: Mukta, "Segoe UI", system-ui, sans-serif;
    display: flex; flex-direction: column;
    justify-content: center;
    padding: 0 160px;
    position: relative;
  }
  /* A single warm wash, off-centre. Flat near-black reads as an unrendered
     frame on a projector. */
  body::before {
    content: ""; position: absolute; inset: 0;
    background: radial-gradient(1100px 700px at 24% 18%, rgba(212,168,67,0.07), transparent 70%);
    pointer-events: none;
  }
  .kicker {
    font-size: 25px; letter-spacing: 0.26em; text-transform: uppercase;
    color: ${t.gold}; margin-bottom: 40px; font-weight: 600;
  }
  .lines {
    font-family: Spectral, Georgia, serif;
    font-weight: 300; font-size: 94px; line-height: 1.13;
    letter-spacing: -0.015em;
  }
  .line + .line { margin-top: 4px; }
  .rule {
    width: 108px; height: 3px; background: ${t.gold};
    margin: 52px 0 44px; border-radius: 2px;
  }
  .stats { display: flex; gap: 112px; margin-bottom: 48px; }
  .fig {
    font-family: Spectral, Georgia, serif; font-size: 72px; font-weight: 400;
    color: ${t.goldBright}; line-height: 1;
  }
  .lab {
    font-size: 23px; color: ${t.inkMuted}; margin-top: 16px;
    max-width: 330px; line-height: 1.45;
  }
  .foot { max-width: 1180px; }
  .foot p {
    font-size: 27px; line-height: 1.6; color: ${t.inkSoft}; font-weight: 300;
  }
  .foot p + p { margin-top: 22px; }
  /* The closing card is the one place the name should be the whole frame. */
  body.end { align-items: center; text-align: center; }
  body.end .lines { font-size: 150px; font-weight: 400; letter-spacing: 0.01em; }
  body.end .foot p { font-size: 32px; color: ${t.gold}; letter-spacing: 0.04em; }
  body.end .rule { margin: 44px auto 38px; }
</style>
<body class="${card.end ? "end" : ""}">
  ${card.kicker ? `<div class="kicker">${card.kicker}</div>` : ""}
  <div class="lines">${lines}</div>
  <div class="rule"></div>
  ${body}
  ${foot}
</body>`;
}
