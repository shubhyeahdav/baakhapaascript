import React, { useEffect, useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { SiteHeader, SiteFooter } from "../components/MarketingChrome";
import hero from "../lib/landingHero.json";
import { KeysVisual, LessonVisual, PlanVisual, TRAVELS } from "../components/marketing/Replicas";

/**
 * The page a stranger sees (Month 4, Day 16).
 *
 * `/` redirected to `/dashboard`, which bounced to `/login`, so the first thing
 * this product showed anyone was a password field. This is the page that was
 * missing: one claim, the proof directly under it, one action repeated.
 *
 * Deliberately minimal. Every block below either states the claim, proves it,
 * or asks for the sign-up — anything that does none of the three was cut,
 * including testimonials (there are none yet, and an invented one would cost
 * more than it earns) and a feature grid (the editor has forty features and a
 * stranger needs three).
 *
 * The hero is not a screenshot or a video. It is the linter's REAL output on
 * the scene it shows — `linter.lint()` returns exactly these two flags for
 * these lines — set in HTML so it costs no download, reads in Devanagari, and
 * a test can hold it to the text. The scene lives in `lib/landingHero.json`;
 * the backend's `tests/test_landing_hero.py` keeps it honest.
 */

// The scene and the flags the linter returns for it. Kept in JSON so the
// backend test can lint the same text and fail if the output changes.
export const HERO_SCENE = hero.scene;
export const HERO_FLAGS = hero.flags;

// Each number traces to a measurement, not a hope — and the page says which.
// The source is printed under the number, so a reader can check it:
//   91.3%  eval_retrieval.py, real queries incl. Nepali, n=46 (MONTH_3_TASKS.md)
//   19     lessons.py — both tracks, free on every tier
//   0      linter.py is regular expressions; it calls no model
const PROOF = [
  {
    value: "91.3%",
    meter: 91.3,
    label: "of real writers' problems matched to the right craft technique, Nepali included",
    source: "eval_retrieval.py · 46 real queries",
  },
  { value: "19", label: "graded lessons, free on every plan", source: "lessons.py · two tracks" },
  { value: "0", label: "AI calls to check a draft", source: "linter.py · rules, no model" },
];

// Three rooms, each beside the screen it describes. The replicas are shared
// with /tour, so the two pages cannot draw the same room two ways.
const PILLARS = [
  {
    title: "Write",
    body: "Format as you type. Pages are counted by the same rule the PDF uses, so page six means one thing everywhere.",
    Visual: KeysVisual,
  },
  {
    title: "Learn",
    body: "Nineteen lessons in two tracks — the page and the story — each graded by the linter, not by a Next button.",
    Visual: LessonVisual,
  },
  {
    title: "Plan",
    body: "Corkboard, outline, storyboard frames and a production package, built from the scenes you wrote.",
    Visual: PlanVisual,
  },
];

const INDENT = {
  heading: "font-bold",
  action: "",
  character: "pl-[38%]",
  paren: "pl-[30%]",
  dialogue: "pl-[20%] pr-[12%]",
};

/* Below-the-fold sections rise once as they enter the viewport. Visible by
   default — the prerendered HTML, a test, a browser with no
   IntersectionObserver and a reader who asked for reduced motion all get the
   finished page; only a browser that can animate it is ever asked to wait. */
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight) return undefined; // already on screen
    el.dataset.reveal = "pending";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.reveal = "in";
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ as: Tag = "div", children, ...rest }) {
  const ref = useReveal();
  return (
    <Tag ref={ref} {...rest}>
      {children}
    </Tag>
  );
}

/* The hero: the editor itself, drawn in HTML. A window with the editor's own
   tabs and page counter, the scene typed onto the paper line by line, and the
   linter's two notes arriving in the margin beside the lines they name — the
   whole product in one picture, and every word of it real. */
function ProductWindow() {
  const t = useT();
  const typed = HERO_SCENE.length;
  const notesAt = 0.35 + typed * 0.07 + 0.3;
  return (
    <figure className="relative mx-auto w-full max-w-[860px]" aria-label={t("Real output from the linter on this scene.")}>
      <div className="landing-glow" aria-hidden="true" />
      <div className="landing-window relative rounded-2xl border border-border bg-surface overflow-hidden">
        {/* The editor's own chrome: project, the three readings, the page */}
        <div className="flex items-center gap-3 px-4 h-11 border-b border-borderSoft bg-elevated/60 text-[12px]">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          </span>
          <span className="text-ink font-medium truncate">चिया</span>
          <span className="hidden sm:inline-flex ml-3 rounded-md border border-borderSoft p-0.5" aria-hidden="true">
            {["Script", "Corkboard", "Outline"].map((tab, i) => (
              <span
                key={tab}
                className={`px-2.5 py-0.5 rounded ${i === 0 ? "bg-gold/15 text-gold" : "text-inkMuted"}`}
              >
                {t(tab)}
              </span>
            ))}
          </span>
          <span className="ml-auto font-mono text-[11px] text-inkMuted tabular-nums" aria-hidden="true">
            p. 1 / 1
          </span>
        </div>

        <div className="bg-bgDeep px-3 sm:px-8 py-6 sm:py-9 flex flex-col lg:flex-row lg:items-start lg:justify-center gap-5 lg:gap-6">
          <div className="landing-page relative w-full lg:max-w-[500px] rounded-[3px] bg-[#FAF9F6] text-[#1B1A17] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)] pl-9 sm:pl-12 pr-5 sm:pr-8 py-7 text-[12.5px] sm:text-[13.5px] leading-[1.7]">
            {HERO_SCENE.map((line, i) =>
              line.kind === "blank" ? (
                <div key={i} className="h-[1.7em]" aria-hidden="true" />
              ) : (
                <p
                  key={i}
                  className={`landing-type relative ${INDENT[line.kind] || ""}`}
                  style={{ animationDelay: `${0.35 + i * 0.07}s` }}
                >
                  {line.flag != null && (
                    <span
                      className={`landing-dot absolute -left-6 sm:-left-8 top-[0.6em] h-2 w-2 rounded-full ${
                        HERO_FLAGS[line.flag].severity === "high" ? "bg-[#C0563B]" : "bg-[#B8871E]"
                      }`}
                      style={{ animationDelay: `${notesAt + line.flag * 0.6}s` }}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={line.flag != null ? "landing-flagged" : undefined}
                    style={line.flag != null ? { animationDelay: `${notesAt + line.flag * 0.6}s` } : undefined}
                  >
                    {line.text}
                  </span>
                  {i === typed - 1 && <span className="landing-caret" aria-hidden="true" />}
                </p>
              ),
            )}
          </div>

          {/* The margin: notes beside the page on a wide screen, under it on a
              phone, where there is no margin to hang them in. */}
          <ol className="w-full lg:w-[232px] lg:mt-[92px] space-y-2.5 shrink-0">
            {HERO_FLAGS.map((f, i) => (
              <li
                key={f.message}
                className="landing-flag rounded-xl border border-borderSoft bg-surface px-4 py-3"
                style={{ animationDelay: `${notesAt + 0.15 + i * 0.6}s` }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${f.severity === "high" ? "bg-[#C0563B]" : "bg-[#B8871E]"}`}
                    aria-hidden="true"
                  />
                  <span className="latin-caps text-[10px] tracking-[0.16em] uppercase text-inkMuted">
                    {t(f.severity === "high" ? "High" : "Medium")}
                  </span>
                </div>
                <p className="text-[12.5px] text-ink leading-snug">{f.message}</p>
                <p className="text-[11.5px] text-gold/90 mt-1 leading-snug">→ {f.technique}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <figcaption className="mt-4 flex items-center justify-center gap-2 text-[11.5px] text-inkMuted">
        <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
        {t("Real output from the linter on this scene.")}
      </figcaption>
    </figure>
  );
}

function ProofBand() {
  const t = useT();
  return (
    <section aria-label={t("Proof")} className="border-y border-borderSoft bg-bgDeep/60">
      <Reveal as="dl" className="landing-reveal max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-14 grid sm:grid-cols-3 gap-10 sm:gap-8">
        {PROOF.map((p) => (
          <div key={p.value} className="min-w-0">
            <dt className="sr-only">{t(p.label)}</dt>
            <dd>
              <span className="block font-display text-[48px] sm:text-[52px] leading-none text-gold tabular-nums">
                {p.value}
              </span>
              {p.meter != null && (
                <span className="mt-4 block h-[3px] w-full max-w-[16rem] rounded-full bg-white/[0.07] overflow-hidden" aria-hidden="true">
                  <span className="landing-meter block h-full rounded-full bg-gold" style={{ width: `${p.meter}%` }} />
                </span>
              )}
              <span className="block mt-3 text-[13.5px] text-inkSoft leading-snug max-w-[18rem]">{t(p.label)}</span>
              <span className="block mt-2 font-mono text-[10.5px] text-inkMuted">
                {t("Source")}: {p.source}
              </span>
            </dd>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const t = useT();

  // A signed-in writer came here to write, not to be sold to.
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  // A stored token is being checked. Holding the background for that moment
  // keeps a returning writer from seeing the sales page flash past.
  let checking = false;
  try {
    checking = isLoading && !!window.localStorage.getItem("token");
  } catch (e) {
    /* no storage: nobody can be signed in */
  }
  if (checking) return <div className="min-h-screen bg-bg" aria-busy="true" />;

  const cta = (
    <Link to="/register" className="btn-gold inline-flex items-center justify-center !px-6 !py-3 !text-[14.5px]">
      {t("Start writing — free")}
    </Link>
  );

  return (
    <div className="min-h-screen bg-bg text-ink overflow-x-hidden">
      <SiteHeader />

      <main id="main" tabIndex={-1}>
        {/* The claim, then the product proving it */}
        <section className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-20">
          <div className="landing-rise text-center max-w-3xl mx-auto">
            <p className="latin-caps text-[11px] tracking-[0.24em] uppercase text-gold/80 mb-5">
              {t("Pre-Production Studio")}
            </p>
            <h1 className="font-display text-[40px] sm:text-[60px] lg:text-[68px] leading-[1.02] text-ink [text-wrap:balance]">
              {t("Screenwriting software that reads Nepali.")}
            </h1>
            <p className="mt-6 mx-auto text-inkSoft text-[15.5px] sm:text-[17px] leading-relaxed max-w-[36rem]">
              {t("Write in Devanagari or English. As you type, a craft linter marks the line that says a feeling out loud instead of playing it — with no AI call, on every plan.")}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {cta}
              <Link to="/tour" className="btn-ghost !py-3">
                {t("Take the tour")}
              </Link>
            </div>
          </div>
          <div className="mt-14 sm:mt-16">
            <ProductWindow />
          </div>
        </section>

        <ProofBand />

        {/* Three rooms, each beside the screen it describes */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-16 sm:space-y-24">
          {PILLARS.map(({ title, body, Visual }, i) => (
            <Reveal
              as="article"
              key={title}
              className="landing-reveal grid md:grid-cols-2 gap-8 md:gap-16 items-center"
            >
              <div className={`min-w-0 ${i % 2 ? "md:order-2" : ""}`}>
                <p className="font-mono text-[12px] text-gold mb-3">0{i + 1}</p>
                <h2 className="font-display text-[30px] sm:text-[38px] leading-tight text-ink">{t(title)}</h2>
                <p className="mt-4 text-[15px] text-inkSoft leading-relaxed max-w-md">{t(body)}</p>
              </div>
              <div className="min-w-0 landing-stage rounded-2xl border border-borderSoft p-5 sm:p-8">
                <Visual />
              </div>
            </Reveal>
          ))}
          <p className="text-center">
            <Link to="/tour" className="text-[14px] text-gold hover:text-goldBright">
              {t("See all five rooms on the tour")} →
            </Link>
          </p>
        </section>

        {/* Where the pages go. Names only, never a logo, never a comparison. */}
        <section aria-labelledby="travels" className="border-t border-borderSoft">
          <Reveal className="landing-reveal max-w-6xl mx-auto px-4 sm:px-6 py-12 flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-12">
            <h2 id="travels" className="font-display text-[24px] text-ink shrink-0">{t("Your pages travel.")}</h2>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-inkSoft">
              {TRAVELS.map(([name, fmt]) => (
                <li key={name}>
                  {t(name)} <span className="font-mono text-[11.5px] text-gold/80">{fmt}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <p className="max-w-6xl mx-auto px-4 sm:px-6 -mt-6 pb-10 text-[11.5px] text-inkMuted">
            {t("Product names belong to their owners. They are listed because the file Baakhapaa exports opens in them, not because of any partnership.")}
          </p>
        </section>

        {/* The ask, once more, with the price stated plainly */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
          <Reveal className="landing-reveal landing-cta relative overflow-hidden rounded-3xl border border-borderSoft px-6 py-14 sm:py-20 text-center">
            <h2 className="font-display text-[30px] sm:text-[44px] leading-tight text-ink [text-wrap:balance]">
              {t("Your next script starts on a blank page.")}
            </h2>
            <p className="mt-4 text-inkSoft text-[14.5px] leading-relaxed">
              {t("Free for three projects. Pro is Rs 999 a month, paid with Khalti or eSewa.")}
            </p>
            <div className="mt-8">{cta}</div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
