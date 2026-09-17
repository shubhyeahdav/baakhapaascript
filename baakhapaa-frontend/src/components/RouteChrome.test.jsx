import React from "react";
import { render, screen } from "@testing-library/react";

/**
 * The three site-wide things an external audit found missing everywhere at
 * once: per-route metadata, the document language, and a skip link.
 *
 * All three were absent on all fourteen routes, which is precisely why they
 * survived review — nothing looked wrong on any individual screen. The audit
 * reported one `<title>` shared by every route, no description or canonical
 * anywhere, `hasSkipLink: false` on every page, and `<html lang="en">` held
 * static while the product ships a full English/नेपाली switch.
 *
 * These assertions are about the document, not about a component's markup, so
 * they read `document.head` and `document.documentElement` directly. That is
 * the surface a crawler and a screen reader actually see.
 */

let mockPathname = "/pricing";
let mockLang = "en";

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: mockPathname }),
  Link: ({ to, children, ...p }) => <a href={to} {...p}>{children}</a>,
}));

vi.mock("../i18n", () => ({
  useLanguage: () => ({ lang: mockLang, setLang: () => {} }),
}));

// eslint-disable-next-line import/first
import RouteChrome from "./RouteChrome";
// eslint-disable-next-line import/first
import { applyDocumentHead, ROUTE_META } from "../lib/documentHead";

const meta = (selector) => document.head.querySelector(selector)?.getAttribute("content");
const linkHref = (rel) => document.head.querySelector(`link[rel="${rel}"]`)?.getAttribute("href");

beforeEach(() => {
  mockPathname = "/pricing";
  mockLang = "en";
  document.head.querySelectorAll("meta, link[rel=canonical]").forEach((n) => n.remove());
  document.documentElement.lang = "en";
});

// --- the skip link ---------------------------------------------------------

describe("skip link", () => {
  it("is rendered, and points at the landmark every page now carries", () => {
    render(<RouteChrome />);

    const link = screen.getByRole("link", { name: /skip to content/i });
    expect(link).toHaveAttribute("href", "#main");
  });

  it("is hidden until focused, which is the only way it is any use", () => {
    // Visible at rest it is clutter on every page; invisible when focused it
    // is a keyboard trap that looks like nothing happened.
    render(<RouteChrome />);

    const link = screen.getByRole("link", { name: /skip to content/i });
    expect(link.className).toMatch(/\bsr-only\b/);
    expect(link.className).toMatch(/focus:not-sr-only/);
  });
});

// --- document language, WCAG 3.1.1 -----------------------------------------

describe("document language", () => {
  it("follows the interface language", () => {
    mockLang = "ne";
    render(<RouteChrome />);

    expect(document.documentElement.lang).toBe("ne");
  });

  it("is English when the interface is English", () => {
    mockLang = "en";
    render(<RouteChrome />);

    expect(document.documentElement.lang).toBe("en");
  });

  it("never emits a language the document does not actually speak", () => {
    // Guards the cast: anything that is not "ne" has to read as "en" rather
    // than reaching the attribute unchecked.
    mockLang = "fr-CA";
    render(<RouteChrome />);

    expect(document.documentElement.lang).toBe("en");
  });
});

// --- per-route head --------------------------------------------------------

describe("per-route metadata", () => {
  it("gives the route its own title", () => {
    render(<RouteChrome />);

    expect(document.title).toBe("Pricing — Baakhapaa");
  });

  it("gives the route its own description", () => {
    render(<RouteChrome />);

    expect(meta('meta[name="description"]')).toMatch(/Khalti or eSewa/);
  });

  it("declares a canonical URL for the route it is on, not for the site root", () => {
    mockPathname = "/privacy";
    render(<RouteChrome />);

    expect(linkHref("canonical")).toBe(`${window.location.origin}/privacy`);
  });

  it("carries Open Graph tags so a shared link is not the same unfurl everywhere", () => {
    render(<RouteChrome />);

    expect(meta('meta[property="og:title"]')).toBe("Pricing — Baakhapaa");
    expect(meta('meta[property="og:type"]')).toBe("website");
    expect(meta('meta[property="og:url"]')).toContain("/pricing");
    expect(meta('meta[name="twitter:card"]')).toBeTruthy();
  });

  it("marks the legal pages as articles rather than as the site", () => {
    mockPathname = "/terms";
    render(<RouteChrome />);

    expect(meta('meta[property="og:type"]')).toBe("article");
  });
});

// --- signed-in surfaces should not be indexed ------------------------------

describe("what a crawler is told to do", () => {
  it("keeps signed-in routes out of the index", () => {
    // A crawler following a link to /dashboard is shown a redirect to /login.
    // Indexing that helps nobody and spends crawl budget.
    mockPathname = "/dashboard";
    render(<RouteChrome />);

    expect(meta('meta[name="robots"]')).toMatch(/noindex/);
  });

  it("does not mark a public route noindex", () => {
    mockPathname = "/pricing";
    render(<RouteChrome />);

    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("treats an unknown route as private rather than indexable", () => {
    // The default matters more than the table: a route added without a
    // ROUTE_META entry is far more likely to be a new signed-in screen than a
    // new marketing page.
    mockPathname = "/some/route/added/later";
    render(<RouteChrome />);

    expect(meta('meta[name="robots"]')).toMatch(/noindex/);
  });

  it("matches a dynamic route to its table entry", () => {
    mockPathname = "/projects/9f3a-2b/editor";
    render(<RouteChrome />);

    expect(meta('meta[name="robots"]')).toMatch(/noindex/);
  });
});

// --- the hook itself -------------------------------------------------------

describe("applyDocumentHead", () => {
  it("upserts rather than appends, so SPA navigation cannot stack duplicates", () => {
    applyDocumentHead({ title: "One", description: "first" });
    applyDocumentHead({ title: "Two", description: "second" });

    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(meta('meta[name="description"]')).toBe("second");
    expect(document.title).toBe("Two — Baakhapaa");
  });

  it("clears a stale noindex when moving from a private route to a public one", () => {
    applyDocumentHead({ title: "Dashboard", noindex: true });
    expect(meta('meta[name="robots"]')).toMatch(/noindex/);

    applyDocumentHead({ title: "Pricing" });
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("falls back to the site title when a route has none", () => {
    applyDocumentHead({});

    expect(document.title).toBe("Baakhapaa — Pre-Production Studio");
  });

  it("omits og:image rather than pointing at something that will not render", () => {
    // Facebook, LinkedIn and X all decline to render SVG, and there is no
    // 1200x630 raster yet. A tag that validates and shows nothing is worse
    // than no tag.
    applyDocumentHead({ title: "Pricing", description: "x" });

    expect(document.head.querySelector('meta[property="og:image"]')).toBeNull();
    expect(meta('meta[name="twitter:card"]')).toBe("summary");
  });
});

// --- the table ------------------------------------------------------------

describe("the route table", () => {
  it("gives every public route a description", () => {
    // The public routes are the only ones a search result can be built from,
    // and all fourteen shared one empty description until now.
    for (const path of ["/login", "/register", "/pricing", "/terms", "/privacy"]) {
      expect(ROUTE_META[path]?.description, `${path} has no description`).toBeTruthy();
    }
  });

  it("does not mark a public route noindex by accident", () => {
    for (const path of ["/login", "/register", "/pricing", "/terms", "/privacy"]) {
      expect(ROUTE_META[path]?.noindex, `${path} is noindex`).toBeFalsy();
    }
  });
});
