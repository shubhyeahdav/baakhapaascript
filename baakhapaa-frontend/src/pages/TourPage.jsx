import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n";
import { SiteHeader, SiteFooter } from "../components/MarketingChrome";
import hero from "../lib/landingHero.json";
import rewrite from "../lib/tourRewrite.json";
import {
  KeysVisual,
  MarginVisual,
  LessonVisual,
  PlanVisual,
  VideoVisual,
  TRAVELS,
} from "../components/marketing/Replicas";

/**
 * The tour: one scene, made better, and the five rooms of the product.
 *
 * `/` makes one claim and proves it. This page is for the visitor who wants
 * to see the thing work before giving it an email address — so it SHOWS
 * rather than lists. Everything drawn here is the product's real behaviour:
 *
 *   - The before/after scene is held to the linter by the backend tests: the
 *     "as written" version must return exactly these two flags
 *     (`landingHero.json`), and the rewrite must return none
 *     (`tourRewrite.json`). The page cannot claim a fix the linter disputes.
 *   - The chapter visuals are small HTML replicas of real screens, not
 *     mock-ups of features that do not exist.
 *   - Other software is named only where a FILE we export opens in it — the
 *     claim the editor's own Export menu already makes. Nothing here says
 *     what another product lacks; we have not tested them and will not guess.
 *
 * Design references, per UI_Inspiration.md: Linear's restraint, Resend's
 * marketing pages. One accent, the product as the picture, motion only where
 * it carries the point (the notes leaving the page), and none at all under
 * prefers-reduced-motion.
 */

const INDENT = {
  heading: "font-bold",
  action: "",
  character: "pl-[38%]",
  paren: "pl-[30%]",
  dialogue: "pl-[20%] pr-[10%]",
};

function Paper({ scene, flagged = [], changed = false }) {
  return (
    <div className="landing-page rounded-[3px] bg-[#FAF9F6] text-[#1B1A17] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)] pl-10 sm:pl-12 pr-5 sm:pr-8 py-7 text-[12.5px] sm:text-[13.5px] leading-[1.7] relative">
      {scene.map((line, i) =>
        line.kind === "blank" ? (
          <div key={i} className="h-[1.7em]" aria-hidden="true" />
        ) : (
          <p key={i} className={`relative ${INDENT[line.kind] || ""}`}>
            {flagged.includes(line.flag) && line.flag != null && (
              <span
                className={`tour-dot absolute -left-7 sm:-left-8 top-[0.6em] h-2 w-2 rounded-full ${
                  line.flag === 0 ? "bg-[#C0563B]" : "bg-[#B8871E]"
                }`}
                aria-hidden="true"
              />
            )}
            <span className={changed && line.changed ? "tour-changed" : undefined}>{line.text}</span>
          </p>
        ),
      )}
    </div>
  );
}

function RewriteDemo() {
  const t = useT();
  const [after, setAfter] = useState(false);
  return (
    <section aria-labelledby="demo-title" className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 id="demo-title" className="latin-caps text-[11px] tracking-[0.24em] uppercase text-inkMuted">
          {t("One scene, two drafts")}
        </h2>
        <div role="group" aria-label={t("Which draft")} className="inline-flex rounded-full border border-borderSoft p-1 bg-surface">
          {[[false, t("As written")], [true, t("Rewritten")]].map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={after === value}
              onClick={() => setAfter(value)}
              className={`px-4 py-1.5 rounded-full text-[13px] transition ${
                after === value ? "bg-gold text-[#141006] font-semibold" : "text-inkSoft hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-8 items-start">
        <div key={after ? "after" : "before"} className="tour-swap">
          <Paper scene={after ? rewrite.scene : hero.scene} flagged={after ? [] : [0, 1]} changed={after} />
        </div>

        <div aria-live="polite">
          {after ? (
            <div className="tour-swap">
              <p className="font-display text-[34px] leading-none text-gold">0</p>
              <p className="mt-2 text-[15px] text-ink">{t("notes from the linter.")}</p>
              <p className="mt-4 text-[14.5px] text-inkSoft leading-relaxed max-w-md">
                {t("Nobody says the grievance now. Sita leaves the sugar out; Ram pushes the glass back and lets his line trail off. The fight is about tea, which is what the craft asks: let them fight about the small wrong thing.")}
              </p>
            </div>
          ) : (
            <ol className="space-y-3">
              {hero.flags.map((f) => (
                <li key={f.rule} className="tour-swap rounded-xl border border-borderSoft bg-surface px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${f.severity === "high" ? "bg-[#C0563B]" : "bg-[#B8871E]"}`} aria-hidden="true" />
                    <span className="latin-caps text-[10px] tracking-[0.16em] uppercase text-inkMuted">
                      {t(f.severity === "high" ? "High" : "Medium")}
                    </span>
                  </div>
                  <p className="text-[13.5px] text-ink leading-snug">{f.message}</p>
                  <p className="text-[12.5px] text-gold/90 mt-1">→ {f.technique}</p>
                </li>
              ))}
              <li className="text-[12.5px] text-inkMuted pt-1">
                {t("Press “Rewritten” to see the same scene after taking the notes.")}
              </li>
            </ol>
          )}
          <p className="mt-6 text-[11.5px] text-inkMuted">
            {t("Both drafts are run through the real linter by the test suite. The page cannot claim a fix the linter disagrees with.")}
          </p>
        </div>
      </div>
    </section>
  );
}

const CHAPTERS = [
  { n: "01", title: "The page", body: "Format as you type: a letter and Tab give you the slugline, the cue, the parenthetical. Pages are counted by the PDF's own rule, in English or Devanagari.", Visual: KeysVisual },
  { n: "02", title: "The margin", body: "The linter reads every pause and leaves a quiet dot beside the line it is about. Open it for what it saw and the technique that answers it. No AI call, on every plan.", Visual: MarginVisual },
  { n: "03", title: "The course", body: "Nineteen lessons in two tracks. Each ends with you writing something, graded by the same checks — and answered in the language you are reading in.", Visual: LessonVisual },
  { n: "04", title: "The plan", body: "Corkboard, outline and cast are three readings of the same scenes. Move a card and the scene moves in the script. Storyboards and a production package come from the page.", Visual: PlanVisual },
  { n: "05", title: "Short and long video", body: "A beat spine with a rehook due every five to eight seconds, a rhythm meter that reads the draft as you type, and sections for essays and courses instead of pretend pages.", Visual: VideoVisual },
];

export default function TourPage() {
  const t = useT();
  return (
    <div className="min-h-screen bg-bg text-ink overflow-x-hidden">
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-12 landing-rise">
          <p className="latin-caps text-[11px] tracking-[0.24em] uppercase text-inkMuted mb-5">{t("The tour")}</p>
          <h1 className="font-display text-[40px] sm:text-[60px] leading-[1.02] max-w-3xl">
            {t("Watch a scene get better.")}
          </h1>
          <p className="mt-6 text-inkSoft text-[15.5px] sm:text-[17px] leading-relaxed max-w-2xl">
            {t("One scene, written the way first drafts are, and what Baakhapaa does about it — in Devanagari, on the free plan, with no AI call. Then the five rooms the rest of the work happens in.")}
          </p>
        </section>

        <RewriteDemo />

        <section aria-label={t("The five rooms")} className="border-t border-borderSoft">
          {CHAPTERS.map(({ n, title, body, Visual }) => (
            <article key={n} className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16 grid md:grid-cols-[110px_1fr_1fr] gap-6 md:gap-10 items-start border-b border-borderSoft last:border-b-0">
              <p className="font-mono text-[13px] text-gold md:sticky md:top-8">{n}</p>
              <div>
                <h2 className="font-display text-[28px] sm:text-[32px] leading-tight">{t(title)}</h2>
                <p className="mt-3 text-[14.5px] text-inkSoft leading-relaxed max-w-md">{t(body)}</p>
              </div>
              <Visual />
            </article>
          ))}
        </section>

        <section aria-labelledby="travels" className="border-t border-borderSoft">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
            <h2 id="travels" className="font-display text-[28px] sm:text-[32px]">{t("Your pages travel.")}</h2>
            <p className="mt-3 text-[14.5px] text-inkSoft leading-relaxed max-w-2xl">
              {t("Write here, and take the script to the software your producer already uses. Nothing is locked in.")}
            </p>
            <ul className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {TRAVELS.map(([name, fmt]) => (
                <li key={name} className="rounded-xl border border-borderSoft bg-surface px-4 py-3.5">
                  <p className="text-[14px] text-ink">{t(name)}</p>
                  <p className="font-mono text-[11.5px] text-gold/80 mt-0.5">{fmt}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11.5px] text-inkMuted max-w-2xl">
              {t("Product names belong to their owners. They are listed because the file Baakhapaa exports opens in them, not because of any partnership.")}
            </p>
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-24 text-center">
          <h2 className="font-display text-[30px] sm:text-[38px] leading-tight">{t("Your next script starts on a blank page.")}</h2>
          <p className="mt-4 text-inkSoft text-[14.5px] leading-relaxed">
            {t("Free for three projects. Pro is Rs 999 a month, paid with Khalti or eSewa.")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="btn-gold inline-flex items-center justify-center !px-6 !py-3 !text-[14.5px]">
              {t("Start writing — free")}
            </Link>
            <Link to="/pricing" className="btn-ghost !py-3">{t("See pricing")}</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
