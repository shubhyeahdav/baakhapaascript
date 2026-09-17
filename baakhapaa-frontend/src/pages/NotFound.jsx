import React from "react";
import { Link } from "react-router-dom";

/**
 * The page for a URL that does not exist.
 *
 * There was no catch-all route, so an unknown path matched nothing and React
 * Router rendered nothing: an audit found `/nonexistent-page-404-test`
 * returning HTTP 200 with zero visible text and no `<h1>` — a blank dark
 * rectangle. Every other route on the site has exactly one `<h1>`; this was the
 * only hole.
 *
 * The status code is still 200 and cannot be anything else: this is a static
 * SPA, the server has already answered by the time the router looks at the
 * path. `robots.txt` and the `noindex` on this route are what keep a crawler
 * from treating it as content. Saying so here rather than leaving the next
 * reader to wonder why the "404 page" is not a 404.
 */
export default function NotFound() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="min-h-screen bg-bg text-ink flex items-center justify-center px-6 outline-none"
    >
      <div className="max-w-md">
        <p className="font-mono text-[11px] tracking-[0.18em] text-inkMuted mb-3">
          NOT FOUND
        </p>
        <h1 className="font-display text-4xl mb-4">This page does not exist</h1>
        <p className="text-[14px] text-inkSoft leading-relaxed mb-8">
          The link may be mistyped, or it may point at something that has been
          moved. Nothing has been lost — your projects are where you left them.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/dashboard"
            className="btn-gold text-[13px] px-5 py-2.5 rounded-xl inline-block"
          >
            Go to your projects
          </Link>
          <Link
            to="/login"
            className="btn-ghost text-[13px] px-5 py-2.5 rounded-xl inline-block"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
