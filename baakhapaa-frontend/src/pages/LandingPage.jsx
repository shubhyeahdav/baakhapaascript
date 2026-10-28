import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { SiteHeader, SiteFooter } from "../components/MarketingChrome";
import hero from "../lib/landingHero.json";

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

// Each number traces to a measurement, not a hope:
//   91.3%  eval_retrieval.py, real queries incl. Nepali, n=46 (MONTH_3_TASKS.md)
//   19     lessons.py — both tracks, free on every tier
//   0      linter.py is regular expressions; it calls no model
const PROOF = [
  { value: "91.3%", label: "of real writers' problems matched to the right craft technique, Nepali included" },
  { value: "19", label: "graded lessons, free on every plan" },
  { value: "0", label: "AI calls to check a draft" },
];

const PILLARS = [
  {
    title: "Write",
    body: "Format as you type. Pages are counted by the same rule the PDF uses, so page six means one thing everywhere.",
  },
  {
    title: "Learn",
    body: "Nineteen lessons in two tracks — the page and the story — each graded by the linter, not by a Next button.",
  },
  {
    title: "Plan",
    body: "Corkboard, outline, storyboard frames and a production package, built from the scenes you wrote.",
  },
];

function ScenePage() {
  const t = useT();
  const indent = {
    heading: "",
    action: "",
    character: "pl-[38%]",
    paren: "pl-[30%]",
    dialogue: "pl-[20%] pr-[14%]",
  };
  return (
    <figure className="relative mx-auto w-full max-w-[540px]" aria-label={t("Real output from the linter on this scene.")}>
      <div className="landing-page rounded-[3px] bg-[#FAF9F6] text-[#1B1A17] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)] px-6 sm:px-9 py-8 text-[12.5px] sm:text-[13.5px] leading-[1.7]">
        {HERO_SCENE.map((line, i) =>
          line.kind === "blank" ? (
            <div key={i} className="h-[1.7em]" aria-hidden="true" />
          ) : (
            <div key={i} className="relative">
              <p className={`${indent[line.kind]} ${line.kind === "heading" ? "font-bold" : ""}`}>
                <span
                  className={line.flag != null ? "landing-flagged" : undefined}
                  style={line.flag != null ? { animationDelay: `${0.9 + line.flag * 0.7}s` } : undefined}
                >
                  {line.text}
                </span>
              </p>
            </div>
          ),
        )}
      </div>

      {/* The flags sit beside the page on a wide screen and under it on a
          phone, where there is no margin to hang them in. */}
      <ol className="mt-4 space-y-2.5 lg:mt-0 lg:absolute lg:top-[38%] lg:-right-5 lg:translate-x-full lg:w-[228px]">
        {HERO_FLAGS.map((f, i) => (
          <li
            key={f.message}
            className="landing-flag rounded-xl border border-borderSoft bg-surface/95 px-4 py-3"
            style={{ animationDelay: `${1.1 + i * 0.7}s` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${f.severity === "high" ? "bg-gold" : "bg-inkSoft"}`}
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
      <figcaption className="mt-4 text-center lg:text-left text-[11.5px] text-inkMuted">
        {t("Real output from the linter on this scene.")}
      </figcaption>
    </figure>
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
        {/* The claim, and the proof beside it */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-16 grid lg:grid-cols-[0.95fr_1.3fr] gap-12 lg:gap-12 items-center">
          <div className="landing-rise">
            <p className="latin-caps text-[11px] tracking-[0.24em] uppercase text-inkMuted mb-5">
              {t("Pre-Production Studio")}
            </p>
            <h1 className="font-display text-[40px] sm:text-[54px] leading-[1.05] text-ink">
              {t("Screenwriting software that reads Nepali.")}
            </h1>
            <p className="mt-6 text-inkSoft text-[15.5px] sm:text-[16.5px] leading-relaxed max-w-[34rem]">
              {t("Write in Devanagari or English. As you type, a craft linter marks the line that says a feeling out loud instead of playing it — with no AI call, on every plan.")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {cta}
              <Link to="/tour" className="btn-ghost !py-3">
                {t("Take the tour")}
              </Link>
            </div>
          </div>
          <div className="lg:pr-[244px]">
            <ScenePage />
          </div>
        </section>

        {/* Three numbers, each one measured */}
        <section aria-label={t("Proof")} className="border-y border-borderSoft">
          <dl className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid sm:grid-cols-3 gap-8">
            {PROOF.map((p) => (
              <div key={p.value}>
                <dt className="sr-only">{t(p.label)}</dt>
                <dd>
                  <span className="block font-display text-[44px] leading-none text-gold tabular-nums">{p.value}</span>
                  <span className="block mt-2 text-[13.5px] text-inkSoft leading-snug max-w-[18rem]">{t(p.label)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* What it is, in three words */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid sm:grid-cols-3 gap-10">
          {PILLARS.map((p) => (
            <div key={p.title}>
              <h2 className="font-display text-[24px] text-ink mb-3">{t(p.title)}</h2>
              <p className="text-[14.5px] text-inkSoft leading-relaxed">{t(p.body)}</p>
            </div>
          ))}
        </section>

        {/* The ask, once more, with the price stated plainly */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24 text-center">
          <h2 className="font-display text-[30px] sm:text-[38px] leading-tight text-ink">
            {t("Your next script starts on a blank page.")}
          </h2>
          <p className="mt-4 text-inkSoft text-[14.5px] leading-relaxed">
            {t("Free for three projects. Pro is Rs 999 a month, paid with Khalti or eSewa.")}
          </p>
          <div className="mt-8">{cta}</div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
