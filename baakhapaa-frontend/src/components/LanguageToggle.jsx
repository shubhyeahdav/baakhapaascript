import React from "react";
import { useLanguage, LANGUAGES } from "../i18n";

/**
 * The language switcher, as a component both the app shell and the signed-out
 * pages can use.
 *
 * It lived only inside `TopNav`'s account dropdown, which meant it required an
 * account. A Nepali writer arriving at the login page — the first screen this
 * product shows anyone — got an English interface and no way to change it,
 * which is the opposite of what a product that lints Nepali dialogue should do
 * at its front door.
 *
 * `variant="bar"` is the dropdown's full-width row; `variant="inline"` is the
 * compact pair the auth pages corner-mount. Same control, same state, two
 * shapes — the alternative was a second copy that drifts.
 */
export default function LanguageToggle({ variant = "bar", className = "" }) {
  const { lang, setLang } = useLanguage();
  const inline = variant === "inline";

  return (
    <div className={`flex gap-1 ${className}`} role="group" aria-label="Language">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={`text-[12px] rounded-md transition ${
            inline ? "px-2.5 py-1" : "flex-1 py-1"
          } ${
            lang === l.code
              ? "bg-goldDim text-gold"
              : "text-inkMuted hover:text-ink"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
