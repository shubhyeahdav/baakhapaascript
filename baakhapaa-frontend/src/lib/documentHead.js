/**
 * Per-route document head.
 *
 * The served HTML is one 848-byte shell, so until now every URL on this site
 * presented crawlers and social scrapers with identical metadata: the same
 * `<title>` on all fourteen routes, no description, no canonical, no Open
 * Graph. A link to `/pricing` and a link to `/privacy` produced the same
 * unfurl, and `/terms` and `/privacy` — the only pages with substantial text —
 * were the only ones whose content a non-JS crawler could not see at all.
 *
 * This is deliberately a ~60-line hook rather than `react-helmet-async`. The
 * whole job is "set four or five tags when a route mounts"; a dependency for
 * that is a dependency to audit, update and explain. React 19 hoists `<title>`
 * and `<meta>` natively and this becomes deletable — the note is here so
 * whoever does that upgrade knows to delete it.
 *
 * Canonical and og:url are built from `window.location.origin` rather than a
 * hardcoded domain, so a Vercel preview deployment declares itself canonical
 * to its own origin instead of pointing every preview at production.
 */

export const SITE_NAME = "Baakhapaa";

// No og:image yet, on purpose. Open Graph wants a 1200x630 raster, and
// Facebook, LinkedIn and X all decline to render SVG — so pointing at the nib
// would produce a tag that validates and shows nothing. Twitter's `summary`
// card is correct without an image; when a designed 1200x630 PNG exists, drop
// it at /og-image.png, set OG_IMAGE below and the card upgrades to
// `summary_large_image` on its own.
export const OG_IMAGE = null;

function upsertMeta(attr, key, content) {
  if (content == null) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel, href) {
  if (!href) return;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Apply a route's head tags. Safe to call on every render — every write is an
 * upsert, so nothing accumulates duplicates as a user navigates the SPA.
 *
 * @param {object}  meta
 * @param {string}  meta.title        Route title, WITHOUT the site suffix.
 * @param {string}  meta.description  One sentence. Omit rather than pad.
 * @param {string} [meta.path]        Canonical path; defaults to the current one.
 * @param {string} [meta.type]        og:type. "website" unless it is an article.
 * @param {boolean}[meta.noindex]     Keep signed-in surfaces out of the index.
 */
export function applyDocumentHead({ title, description, path, type = "website", noindex = false }) {
  if (typeof document === "undefined") return;

  const full = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Pre-Production Studio`;
  document.title = full;

  const origin = (typeof window !== "undefined" && window.location && window.location.origin) || "";
  const url = origin ? origin + (path || window.location.pathname) : undefined;

  upsertMeta("name", "description", description);
  upsertLink("canonical", url);

  upsertMeta("property", "og:title", full);
  upsertMeta("property", "og:description", description);
  upsertMeta("property", "og:type", type);
  upsertMeta("property", "og:site_name", SITE_NAME);
  upsertMeta("property", "og:url", url);
  if (OG_IMAGE) upsertMeta("property", "og:image", origin + OG_IMAGE);

  upsertMeta("name", "twitter:card", OG_IMAGE ? "summary_large_image" : "summary");
  upsertMeta("name", "twitter:title", full);
  upsertMeta("name", "twitter:description", description);

  // Signed-in surfaces redirect to /login for a crawler, so indexing them
  // advertises a redirect. robots.txt disallows them too; this is the half that
  // still applies if someone links straight to one.
  const robots = document.head.querySelector('meta[name="robots"]');
  if (noindex) {
    upsertMeta("name", "robots", "noindex, nofollow");
  } else if (robots) {
    robots.remove();
  }
}

/**
 * What each route says about itself.
 *
 * Kept in one table rather than scattered through the pages so that "does every
 * route have a description" is a question you can answer by reading one screen,
 * which is how the all-fourteen-identical state lasted as long as it did.
 * Descriptions are written for a search result, not for the team.
 */
export const ROUTE_META = {
  "/login": {
    title: "Sign in",
    description:
      "Sign in to Baakhapaa — screenplay structure, scene drafting and storyboards, built for Nepali storytelling.",
  },
  "/register": {
    title: "Create an account",
    description:
      "Start writing on Baakhapaa. Three projects free, a nineteen-lesson screenwriting course at no cost, and a craft linter that reads Nepali.",
  },
  "/pricing": {
    title: "Pricing",
    description:
      "Rs. 999 and Rs. 2,499 a month, payable with Khalti or eSewa. The free tier keeps three projects and the whole course.",
  },
  "/terms": {
    title: "Terms of Use",
    description:
      "What Baakhapaa commits to and what it asks of you. A draft, published before sign-up so you can read it first.",
    type: "article",
  },
  "/privacy": {
    title: "Privacy Policy",
    description:
      "What Baakhapaa stores, what leaves the server and to whom, and what deletion removes. Written against Nepal's Privacy Act 2075.",
    type: "article",
  },
  "/dashboard": { title: "Your projects", noindex: true },
  "/settings": { title: "Settings", noindex: true },
  "/storyboards": { title: "Storyboards", noindex: true },
  "/exports": { title: "Exports", noindex: true },
  "/learn": { title: "Learn screenwriting", noindex: true },
  "/onboarding": { title: "Getting started", noindex: true },
  "/projects/new": { title: "New project", noindex: true },
};
