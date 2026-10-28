import React from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n";
import LanguageToggle from "./LanguageToggle";

/**
 * Header and footer for the public pages a stranger reads — `/` and `/tour`.
 *
 * One copy, so the two pages cannot drift into two navigations. Deliberately
 * not the app's `TopNav`: a visitor has no projects, no plan and no account
 * menu, and showing them those would be showing them a product they cannot
 * use yet.
 */
export function SiteHeader() {
  const t = useT();
  return (
    <header className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
      <Link to="/" className="wordmark text-[15px]" aria-label="Baakhapaa">
        BAAKHAPAA
      </Link>
      <nav className="flex items-center gap-1 sm:gap-4 text-[13px]" aria-label={t("Main")}>
        <Link to="/tour" className="hidden sm:inline text-inkSoft hover:text-ink px-2 py-1">
          {t("Tour")}
        </Link>
        <Link to="/pricing" className="hidden sm:inline text-inkSoft hover:text-ink px-2 py-1">
          {t("Pricing")}
        </Link>
        <LanguageToggle variant="inline" />
        <Link to="/login" className="text-inkSoft hover:text-ink px-2 py-1">
          {t("Sign In")}
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const t = useT();
  return (
    <footer className="border-t border-borderSoft">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-[12.5px] text-inkMuted">
        <span>© {new Date().getFullYear()} Baakhapaa</span>
        <nav className="flex gap-5" aria-label={t("Legal")}>
          <Link to="/tour" className="hover:text-ink">{t("Tour")}</Link>
          <Link to="/pricing" className="hover:text-ink">{t("Pricing")}</Link>
          <Link to="/terms" className="hover:text-ink">{t("Terms")}</Link>
          <Link to="/privacy" className="hover:text-ink">{t("Privacy")}</Link>
        </nav>
      </div>
    </footer>
  );
}
