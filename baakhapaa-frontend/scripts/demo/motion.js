/**
 * Animated cards. Real motion, recorded rather than faked with ffmpeg pans.
 *
 * Each card is an HTML page that animates itself on load, and Playwright
 * records the page at wall-clock time — so a CSS keyframe and a counting
 * number come out as actual motion instead of a still with a zoom on it.
 *
 * THE MOTION HAS A JOB. A number that counts up earns its animation because
 * the argument IS the movement from 16 to 90. A headline whose words rise in
 * sequence earns it because it is read in that order anyway. Nothing here
 * spins, bounces or slides in from off-screen: this is shown to investors,
 * and motion that draws attention to itself reads as a company with more
 * design budget than product.
 *
 * Everything lands inside the first 1.6 seconds and then holds, because the
 * card has to sit still under the rest of its narration line.
 */

export const THEME = {
  bg: "#0B0B0A",
  bgDeep: "#080807",
  gold: "#D4A843",
  goldBright: "#E4BE64",
  ink: "#EDEAE3",
  inkSoft: "#9B968A",
  inkMuted: "#7E7A6F",
};

/**
 * `voice` ties a card to its narration line in `voice/lines.json`, which is
 * what sets its duration. `hold` is the visual's share of that line when the
 * beat also cuts to footage; the footage takes the rest.
 */
export const BEATS = [
  {
    id: "01-gap",
    voice: "01-gap",
    kicker: "Baakhapaa",
    lines: ["Nepal writes.", "Its writing tools", "do not read Nepali."],
  },
  {
    id: "02-linter",
    voice: "02-linter",
    hold: 3.2,
    clip: "02-linter",
    // The Craft panel only opens 13s into that recording, and the beat says
    // "it finds the line that states a feeling". Taking the tail blindly gave
    // three seconds of the Assist tab under that sentence -- the right app,
    // the wrong panel, while the voice described the panel not being shown.
    clipFrom: 11.5,
    kicker: "What we built",
    lines: ["The craft linter", "reads Devanagari."],
    foot: "No AI call. Works on a half-written page.",
  },
  {
    id: "03-craft",
    voice: "03-craft",
    hold: 3.2,
    clip: "03-craft",
    kicker: "Craft, retrieved",
    lines: ["45 techniques,", "matched by meaning."],
    foot: "Embedded locally. No API key, nothing per query.",
  },
  {
    id: "04-moat-test",
    voice: "04-moat-test",
    kicker: "Why it is hard to copy",
    lines: ["The obvious fix", "did not work."],
    // Two bars at nearly the same length IS the argument: the model scores a
    // matching pair and an unrelated pair almost identically, so it is not
    // reading the script. A reader sees that before the sentence explains it.
    bars: {
      caption: "Embedding similarity, two Devanagari sentences",
      rows: [
        { label: "same meaning", value: 0.898 },
        { label: "different meaning", value: 0.877 },
      ],
      gap: "a gap of 0.02",
    },
  },
  {
    id: "04-moat-fix",
    voice: "04-moat-fix",
    kicker: "The fix we measured",
    lines: ["Translate out of Nepali", "before embedding."],
    // The one number that counts. Everything else on the card is still.
    counter: { from: 16, to: 90, suffix: "%", label: "retrieval precision@1", ci: "CI fails below 85%" },
  },
  {
    id: "05-economics",
    voice: "05-economics",
    hold: 3.0,
    clip: "07-pricing",
    kicker: "Unit economics",
    lines: ["The free tier costs", "nothing to serve."],
    foot: "Khalti and eSewa — Stripe cannot collect from most Nepali cards.",
  },
  {
    id: "06-standing",
    voice: "06-standing",
    kicker: "Where it stands",
    lines: ["Deployed."],
    stats: [
      ["2,602", "automated tests"],
      ["45", "craft entries"],
      ["19", "lessons, free"],
    ],
    foot: "Not yet proven: no completed payment, no writer trial, legal documents unreviewed.",
    end: "baakhapaascript.vercel.app",
  },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Split a headline into spans so the words can rise in sequence. */
const words = (line, base) =>
  line.split(" ").map((w, i) =>
    `<span class="w" style="animation-delay:${(base + i * 0.055).toFixed(3)}s">${esc(w)}</span>`,
  ).join(" ");

// No duration argument: every animation lands inside the first 1.6 seconds
// and then holds, so a card's markup is the same whether it is on screen for
// three seconds or nineteen. The recorder decides how long to film it.
export function motionHtml(beat) {
  const t = THEME;

  const headline = beat.lines
    .map((l, i) => `<div class="line">${words(l, 0.28 + i * 0.13)}</div>`)
    .join("");

  const bars = beat.bars
    ? `<div class="bars">
         <div class="bcap">${esc(beat.bars.caption)}</div>
         ${beat.bars.rows.map((r, i) => `
           <div class="brow">
             <div class="blab">${esc(r.label)}</div>
             <div class="btrack"><i style="--w:${(r.value * 100).toFixed(1)}%;animation-delay:${0.9 + i * 0.18}s"></i></div>
             <div class="bval" style="animation-delay:${1.5 + i * 0.18}s">${r.value}</div>
           </div>`).join("")}
         <div class="bgap">${esc(beat.bars.gap)}</div>
       </div>`
    : "";

  const counter = beat.counter
    ? `<div class="counter">
         <div class="cnum"><span id="cv">${beat.counter.from}</span>${esc(beat.counter.suffix)}</div>
         <div class="clab">${esc(beat.counter.label)}</div>
         <div class="cci">${esc(beat.counter.ci)}</div>
       </div>`
    : "";

  const stats = beat.stats
    ? `<div class="stats">${beat.stats.map(([fig, lab], i) =>
        `<div class="stat" style="animation-delay:${0.85 + i * 0.14}s">
           <div class="fig">${esc(fig)}</div><div class="lab">${esc(lab)}</div>
         </div>`).join("")}</div>`
    : "";

  const foot = beat.foot ? `<div class="foot">${esc(beat.foot)}</div>` : "";
  const end = beat.end ? `<div class="end">${esc(beat.end)}</div>` : "";

  return `<!doctype html>
<meta charset="utf-8">
<title>${beat.id}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@300;400;600&family=Mukta:wght@300;400;600&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1920px;height:1080px;overflow:hidden}
  body{
    background:${t.bg}; color:${t.ink};
    font-family:Mukta,"Segoe UI",system-ui,sans-serif;
    display:flex; flex-direction:column; justify-content:center;
    padding:0 160px; position:relative;
  }
  /* A slow drift, 24s, so a card held for 19 seconds is never a frozen frame.
     Far below the speed anything reads as "moving" -- it just stops the
     background being dead. */
  body::before{
    content:""; position:absolute; inset:-14%;
    background:radial-gradient(1100px 700px at 24% 18%, rgba(212,168,67,0.085), transparent 70%);
    animation:drift 24s ease-in-out infinite alternate;
  }
  @keyframes drift{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(5%,3%,0) scale(1.1)}}

  @keyframes rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
  @keyframes fade{from{opacity:0}to{opacity:1}}
  @keyframes draw{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  @keyframes grow{from{width:0}to{width:var(--w)}}

  .kicker{
    font-size:25px;letter-spacing:.26em;text-transform:uppercase;color:${t.gold};
    margin-bottom:40px;font-weight:600;
    opacity:0;animation:rise .7s cubic-bezier(.2,.7,.3,1) .05s forwards;
  }
  .lines{font-family:Spectral,Georgia,serif;font-weight:300;font-size:94px;line-height:1.13;letter-spacing:-.015em}
  .line+.line{margin-top:4px}
  /* inline-block so the transform applies; the space between spans is the
     real word gap, so no letter-spacing hack is needed. */
  .w{display:inline-block;opacity:0;animation:rise .72s cubic-bezier(.2,.7,.3,1) forwards}
  .rule{
    width:108px;height:3px;background:${t.gold};margin:52px 0 44px;border-radius:2px;
    transform-origin:left center;transform:scaleX(0);
    animation:draw .75s cubic-bezier(.2,.7,.3,1) .62s forwards;
  }
  .foot{max-width:1180px;font-size:27px;line-height:1.6;color:${t.inkSoft};font-weight:300;
    opacity:0;animation:fade .9s ease .95s forwards}
  .end{margin-top:34px;font-size:30px;letter-spacing:.05em;color:${t.gold};
    opacity:0;animation:fade .9s ease 1.3s forwards}

  .bars{margin-bottom:40px;max-width:1150px}
  .bcap{font-size:22px;color:${t.inkMuted};margin-bottom:26px;opacity:0;animation:fade .7s ease .8s forwards}
  .brow{display:flex;align-items:center;gap:28px;margin-bottom:18px}
  .blab{width:290px;font-size:25px;color:${t.inkSoft};text-align:right}
  .btrack{flex:1;height:26px;background:rgba(255,255,255,.05);border-radius:4px;overflow:hidden}
  .btrack i{display:block;height:100%;width:0;border-radius:4px;
    background:linear-gradient(90deg,${t.gold},${t.goldBright});
    animation:grow 1.1s cubic-bezier(.2,.7,.3,1) forwards}
  .bval{width:120px;font-family:Spectral,Georgia,serif;font-size:36px;color:${t.goldBright};
    opacity:0;animation:fade .5s ease forwards}
  .bgap{margin-top:22px;margin-left:318px;font-size:25px;color:${t.ink};
    opacity:0;animation:fade .8s ease 2.1s forwards}

  .counter{margin-bottom:34px}
  .cnum{font-family:Spectral,Georgia,serif;font-size:170px;line-height:1;color:${t.goldBright};
    font-variant-numeric:tabular-nums}
  .clab{font-size:26px;color:${t.inkSoft};margin-top:14px}
  .cci{font-size:22px;color:${t.inkMuted};margin-top:8px}

  .stats{display:flex;gap:112px;margin-bottom:46px}
  .stat{opacity:0;animation:rise .8s cubic-bezier(.2,.7,.3,1) forwards}
  .fig{font-family:Spectral,Georgia,serif;font-size:72px;color:${t.goldBright};line-height:1}
  .lab{font-size:23px;color:${t.inkMuted};margin-top:14px}
</style>
<body>
  ${beat.kicker ? `<div class="kicker">${esc(beat.kicker)}</div>` : ""}
  <div class="lines">${headline}</div>
  <div class="rule"></div>
  ${bars}${counter}${stats}${foot}${end}
<script>
  // The count. requestAnimationFrame rather than a CSS keyframe because the
  // value has to be TEXT -- an investor reads the number, and a transform
  // cannot change a digit.
  const c = ${JSON.stringify(beat.counter || null)};
  if (c) {
    const el = document.getElementById("cv");
    const START = 900, DUR = 1500;          // ms, after load
    const ease = (u) => 1 - Math.pow(1 - u, 3);
    const t0 = performance.now() + START;
    const step = (now) => {
      const u = Math.min(1, Math.max(0, (now - t0) / DUR));
      el.textContent = Math.round(c.from + (c.to - c.from) * ease(u));
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
</script>
</body>`;
}
