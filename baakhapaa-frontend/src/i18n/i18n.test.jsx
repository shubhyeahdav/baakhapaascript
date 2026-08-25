import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider, useT, useLanguage } from "./index";
import { STRINGS } from "./strings";

/**
 * The product asks writers to write in Nepali, lints their Nepali dialogue and
 * lets them type it — while every label around the page stayed English.
 */

function Probe() {
  const t = useT();
  const { lang, setLang } = useLanguage();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="known">{t("Projects")}</span>
      <span data-testid="unknown">{t("A string nobody has translated yet")}</span>
      <button onClick={() => setLang("ne")}>to nepali</button>
    </div>
  );
}

const show = () => render(<LanguageProvider><Probe /></LanguageProvider>);

beforeEach(() => window.localStorage.clear());

test("English by default", () => {
  show();
  expect(screen.getByTestId("lang")).toHaveTextContent("en");
  expect(screen.getByTestId("known")).toHaveTextContent("Projects");
});

test("switching language translates the interface", () => {
  show();
  fireEvent.click(screen.getByText("to nepali"));
  expect(screen.getByTestId("known")).toHaveTextContent("परियोजनाहरू");
});

test("an untranslated string shows readable English, not a key", () => {
  // The whole reason keys are English sentences: a half-finished translation
  // degrades into a bilingual interface rather than a broken one.
  show();
  fireEvent.click(screen.getByText("to nepali"));
  expect(screen.getByTestId("unknown")).toHaveTextContent(
    "A string nobody has translated yet"
  );
});

test("the choice survives a reload", () => {
  show();
  fireEvent.click(screen.getByText("to nepali"));
  expect(window.localStorage.getItem("baakhapaa:lang")).toBe("ne");
});

test("a Nepali browser opens in Nepali without anyone finding a setting", () => {
  const original = window.navigator.language;
  Object.defineProperty(window.navigator, "language", { value: "ne-NP", configurable: true });
  show();
  expect(screen.getByTestId("lang")).toHaveTextContent("ne");
  Object.defineProperty(window.navigator, "language", { value: original, configurable: true });
});

test("a disabled localStorage does not break the app", () => {
  const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(() => show()).not.toThrow();
  getItem.mockRestore();
});

test("every Nepali string is actually Devanagari", () => {
  // A dictionary entry that is still English is worse than a missing one: it
  // looks translated and silently is not.
  const devanagari = /[ऀ-ॿ]/;
  for (const [key, value] of Object.entries(STRINGS.ne)) {
    expect(devanagari.test(value)).toBe(true, `${key} is not in Devanagari`);
  }
});

test("no Nepali string was left identical to its English key", () => {
  for (const [key, value] of Object.entries(STRINGS.ne)) {
    expect(value).not.toBe(key);
  }
});
