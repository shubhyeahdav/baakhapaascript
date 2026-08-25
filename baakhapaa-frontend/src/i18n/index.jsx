import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { STRINGS, LANGUAGES } from "./strings";

/**
 * Which language the interface speaks.
 *
 * Kept separate from `user.preferences.language`, which is the language the
 * writer's *script* is in. Those look like the same setting and are not: a
 * writer working in Nepali may well want English menus because that is what
 * every other tool they use has taught them, and a writer working in English
 * may prefer a Nepali interface. Tying them together would take one of those
 * choices away.
 *
 * Stored client-side. The UI language is a property of the machine somebody is
 * sitting at as much as of the account — and it has to be readable before the
 * first request returns, which rules out fetching it.
 */
const STORAGE_KEY = "baakhapaa:lang";
const LanguageContext = createContext(null);

function initialLanguage() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && STRINGS[saved]) return saved;
    // Then the browser's own preference, so a Nepali-configured machine opens
    // in Nepali without anybody having to find a setting.
    const preferred = (window.navigator.language || "").toLowerCase();
    if (preferred.startsWith("ne")) return "ne";
  } catch (e) {
    /* private browsing, or no localStorage at all */
  }
  return "en";
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(initialLanguage);

  const change = useCallback((next) => {
    setLang(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      /* the choice still applies for this session */
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang: change }), [lang, change]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * `t("Sign In")`.
 *
 * A missing key returns the key, which is an English sentence — so an
 * untranslated string shows as readable English rather than as `nav.projects`.
 * That is the whole reason the keys are sentences, and it means a half-finished
 * translation degrades into a bilingual interface instead of a broken one.
 */
export function useT() {
  const ctx = useContext(LanguageContext);
  const lang = ctx?.lang || "en";
  return useCallback((key) => (STRINGS[lang] && STRINGS[lang][key]) || key, [lang]);
}

export function useLanguage() {
  return useContext(LanguageContext) || { lang: "en", setLang: () => {} };
}

export { LANGUAGES };
