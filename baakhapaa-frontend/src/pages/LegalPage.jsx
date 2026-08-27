import React from "react";
import { Link } from "react-router-dom";
import { terms as termsMd, privacy as privacyMd } from "virtual:legal-documents";

/**
 * The Terms of Use and the Privacy Policy, served inside the app.
 *
 * Both documents existed at the repo root and were reachable from nowhere: the
 * product collected accounts, stored unproduced scripts and sent them to two AI
 * providers, while the pages describing all of that could only be read by
 * someone browsing the source. That is the gap this page closes.
 *
 * The text comes from the root files through a build-time virtual module
 * (`vite.config.js`) rather than a copy under `src/`. Two copies of a legal
 * document is how a product ends up showing users the older one, and
 * `LEGAL_REVIEW.md` edits the root copies.
 *
 * The renderer below is deliberately small and handles exactly the subset these
 * two documents use — headings, bold, links, bullets, paragraphs, rules. A
 * markdown library would be 40KB in a 130KB bundle to render two static pages
 * that we author ourselves and can therefore keep inside the subset. The same
 * reasoning as `i18n/strings.js`.
 *
 * NOT SAFE TO LAUNCH ON. Both files are still the unreviewed templates
 * `CLAUDE.md` describes, they carry a literal `[DATE]` placeholder, and
 * `LEGAL_REVIEW.md` says they need a Nepal-qualified lawyer. Serving them is
 * strictly better than the previous state — a user can now read what they are
 * agreeing to — but the banner below says so out loud rather than letting a
 * template pass as a reviewed policy.
 */

const INLINE = [
  // Order matters: links before bold, so a bolded link keeps its href.
  [/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-gold hover:underline">$1</a>'],
  [/\*\*([^*]+)\*\*/g, '<strong class="text-ink">$1</strong>'],
  [/`([^`]+)`/g, '<code class="font-mono text-[0.9em] text-gold/90">$1</code>'],
];

const escape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Escape first, then re-introduce only the inline markup we recognise. */
function inline(text) {
  return INLINE.reduce((out, [re, sub]) => out.replace(re, sub), escape(text));
}

function render(markdown) {
  const out = [];
  let list = null;

  const flush = () => {
    if (list) {
      out.push({ type: "ul", items: list });
      list = null;
    }
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();

    // The templates carry `**Last updated: [DATE]**`. Showing a reader a
    // placeholder where a date belongs looks like a bug and tells them
    // nothing; the draft banner above already says the document is not in
    // force, which is the honest version of the same information.
    if (line.includes("[DATE]")) continue;

    if (/^\s*[-*]\s+/.test(line)) {
      list = list || [];
      list.push(inline(line.replace(/^\s*[-*]\s+/, "")));
      continue;
    }
    flush();

    if (!line.trim()) continue;
    if (/^---+$/.test(line.trim())) { out.push({ type: "hr" }); continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      out.push({ type: `h${heading[1].length}`, text: inline(heading[2]) });
      continue;
    }
    out.push({ type: "p", text: inline(line) });
  }
  flush();
  return out;
}

const BLOCK_CLASS = {
  h1: "font-display text-3xl text-ink mt-10 mb-3 first:mt-0",
  h2: "font-display text-xl text-ink mt-8 mb-2",
  h3: "text-[15px] font-semibold text-ink mt-6 mb-1.5",
  h4: "text-[13.5px] font-semibold text-inkSoft mt-4 mb-1",
  p: "text-[13.5px] text-inkSoft leading-relaxed mb-3",
};

function Markdown({ source }) {
  return (
    <>
      {render(source).map((block, i) => {
        if (block.type === "hr") {
          return <hr key={i} className="border-borderSoft my-8" />;
        }
        if (block.type === "ul") {
          return (
            <ul key={i} className="list-disc pl-5 mb-4 space-y-1.5">
              {block.items.map((item, j) => (
                <li key={j} className="text-[13.5px] text-inkSoft leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: item }} />
              ))}
            </ul>
          );
        }
        const Tag = block.type.startsWith("h") ? block.type : "p";
        return (
          <Tag key={i} className={BLOCK_CLASS[block.type] || BLOCK_CLASS.p}
               dangerouslySetInnerHTML={{ __html: block.text }} />
        );
      })}
    </>
  );
}

const DOCS = {
  terms: { source: termsMd, title: "Terms of Use", other: ["/privacy", "Privacy Policy"] },
  privacy: { source: privacyMd, title: "Privacy Policy", other: ["/terms", "Terms of Use"] },
};

export default function LegalPage({ doc = "terms" }) {
  const { source, title, other } = DOCS[doc] || DOCS.terms;
  // The templates ship with a literal `[DATE]`. Saying "not yet in force" is
  // more honest than printing the placeholder at a reader.
  const isDraft = source.includes("[DATE]");

  return (
    <div className="cine-bg min-h-screen text-ink">
      <header className="px-8 md:px-14 py-6 border-b border-borderSoft flex items-center gap-6">
        <Link to="/" className="wordmark text-[15px]">BAAKHAPAA</Link>
        <nav className="ml-auto flex gap-6 text-[13px]">
          <Link to={other[0]} className="text-inkMuted hover:text-gold transition-colors">
            {other[1]}
          </Link>
          <Link to="/register" className="text-inkMuted hover:text-gold transition-colors">
            Create account
          </Link>
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-8 py-10 pb-20">
        {isDraft && (
          <p className="mb-8 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3
                        text-[12.5px] text-amber-200/90 leading-snug">
            <strong className="text-amber-200">Draft.</strong> This document has
            not been reviewed by a lawyer and is not yet in force. It is
            published here so you can read what the product intends to commit
            to before you sign up.
          </p>
        )}
        <article>
          <Markdown source={source} />
        </article>
      </main>
    </div>
  );
}
