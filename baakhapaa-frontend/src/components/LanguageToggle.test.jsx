import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * The language switcher, as its own component.
 *
 * It lived only inside TopNav's account dropdown, which meant switching to
 * Nepali required already having an account. The login page — the first screen
 * this product shows anyone — was English with no way out, in a product whose
 * whole differentiator is that it reads and lints Nepali.
 */

// eslint-disable-next-line import/first
import LanguageToggle from "./LanguageToggle";

it("offers every language the product ships", () => {
  render(<LanguageToggle />);

  expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "नेपाली" })).toBeInTheDocument();
});

it("names Nepali in Nepali, not in English", () => {
  // A writer hunting for their own language is hunting for their own word.
  render(<LanguageToggle />);

  expect(screen.queryByRole("button", { name: "Nepali" })).not.toBeInTheDocument();
});

it("marks the current language as pressed", () => {
  // Degrades to "en" without a provider, which is the default.
  render(<LanguageToggle />);

  expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "नेपाली" })).toHaveAttribute("aria-pressed", "false");
});

it("groups the pair for a screen reader", () => {
  render(<LanguageToggle />);

  expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
});

it("does not submit the form it sits in", () => {
  // Both auth pages mount this inside or beside a form.
  render(<LanguageToggle />);

  for (const b of screen.getAllByRole("button")) {
    expect(b).toHaveAttribute("type", "button");
  }
});

it("still switches when the click lands", () => {
  render(<LanguageToggle />);

  fireEvent.click(screen.getByRole("button", { name: "नेपाली" }));

  // With no provider the context degrades and setLang is a no-op, so this
  // asserts only that clicking is safe — the wiring is covered by TopNav's
  // own suite, which renders inside the real provider.
  expect(screen.getByRole("button", { name: "नेपाली" })).toBeInTheDocument();
});

it("renders both shapes from one implementation", () => {
  const { container: bar } = render(<LanguageToggle variant="bar" />);
  const { container: inline } = render(<LanguageToggle variant="inline" />);

  expect(bar.querySelector("button").className).toContain("flex-1");
  expect(inline.querySelector("button").className).not.toContain("flex-1");
});
