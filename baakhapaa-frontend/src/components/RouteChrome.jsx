import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { useLanguage } from "../i18n";
import { applyDocumentHead, ROUTE_META } from "../lib/documentHead";

/**
 * The three things that belong to every route and to no page in particular:
 * the document title and its metadata, the document's language, and the skip
 * link that lets a keyboard user past the navigation.
 *
 * All three were missing site-wide rather than page by page, which is what made
 * them easy to miss in review: nothing looked wrong on any individual screen.
 * An external audit found identical `<title>` on all fourteen routes, no
 * description or canonical anywhere, `hasSkipLink: false` everywhere, and
 * `<html lang="en">` held static while the interface offers a full
 * English/नेपाली switch.
 *
 * Renders nothing except the skip link. The head work is an effect, because
 * `document.title` is not React state.
 */

/** `/projects/abc-123/editor` -> `/projects/:id/editor`, so the table can key on it. */
function routeKey(pathname) {
  return pathname
    .replace(/\/projects\/[^/]+\//, "/projects/:id/")
    .replace(/\/payment\/return\/[^/]+$/, "/payment/return/:provider")
    .replace(/\/$/, "") || "/";
}

// Routes with no entry in ROUTE_META are signed-in surfaces or one-offs. They
// get the site title and `noindex`, which is the right default: a crawler
// following a link to one is shown a redirect to /login, and indexing that
// helps nobody.
const FALLBACK = { noindex: true };

export default function RouteChrome() {
  const { pathname } = useLocation();
  const { lang } = useLanguage();

  useEffect(() => {
    // FALLBACK applies only when the route has NO entry. Spreading it under
    // every entry instead would make its `noindex: true` win on /pricing and
    // /register, whose entries simply do not mention noindex — silently
    // de-indexing the two pages the product most needs found.
    const entry = ROUTE_META[routeKey(pathname)];
    applyDocumentHead({ ...(entry || FALLBACK), path: pathname });
  }, [pathname]);

  // WCAG 3.1.1. A screen reader picks its voice from this attribute, so with it
  // pinned to "en" a Nepali interface was being read out by an English voice —
  // the product's whole differentiator, mispronounced. `dir` stays ltr:
  // Devanagari is left-to-right.
  useEffect(() => {
    document.documentElement.lang = lang === "ne" ? "ne" : "en";
  }, [lang]);

  return (
    // Visually hidden until focused, which is the only way this is any use: it
    // must be the first thing Tab reaches and invisible to everyone else.
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-elevated focus:text-ink focus:border focus:border-gold focus:outline-none"
    >
      Skip to content
    </a>
  );
}
