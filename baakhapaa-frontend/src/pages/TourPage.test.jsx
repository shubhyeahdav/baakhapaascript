import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * The tour. What is pinned is what the page promises: it renders for a
 * stranger, the before/after demo shows the linter's flags and then none,
 * other software is named only as a place our exports open, and the one
 * action is still sign-up. That both drafts really lint that way is held by
 * the backend (`tests/test_landing_hero.py`), against the same JSON.
 */
let mockLang = "en";
vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
}));
vi.mock("../i18n", async () => {
  const { STRINGS } = await vi.importActual("../i18n/strings");
  return {
    useT: () => (key) => (STRINGS[mockLang] && STRINGS[mockLang][key]) || key,
    useLanguage: () => ({ lang: mockLang, setLang: () => {} }),
    LANGUAGES: [{ code: "en", label: "English" }, { code: "ne", label: "नेपाली" }],
  };
});

// eslint-disable-next-line import/first
import TourPage from "./TourPage";
// eslint-disable-next-line import/first
import hero from "../lib/landingHero.json";

beforeEach(() => { mockLang = "en"; });

it("renders for a stranger with one h1", () => {
  render(<TourPage />);
  const h1 = screen.getAllByRole("heading", { level: 1 });
  expect(h1).toHaveLength(1);
  expect(h1[0]).toHaveTextContent("Watch a scene get better.");
});

it("shows the linter's notes on the first draft, and none on the rewrite", () => {
  render(<TourPage />);
  const demo = () => screen.getByRole("heading", { name: "One scene, two drafts" }).closest("section");
  hero.flags.forEach((f) => expect(within(demo()).getByText(f.message)).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: "Rewritten" }));

  hero.flags.forEach((f) => expect(within(demo()).queryByText(f.message)).toBeNull());
  expect(within(demo()).getByText("0")).toBeInTheDocument();
  expect(screen.getByText("आज तिम्रो चियामा चिनी छैन।")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rewritten" })).toHaveAttribute("aria-pressed", "true");
});

it("walks the five rooms", () => {
  render(<TourPage />);
  ["The page", "The margin", "The course", "The plan", "Short and long video"].forEach((t) =>
    expect(screen.getByRole("heading", { level: 2, name: t })).toBeInTheDocument());
});

it("names other software only as somewhere our exports open, and says so", () => {
  render(<TourPage />);
  const travels = screen.getByRole("heading", { name: "Your pages travel." }).parentElement;
  ["Final Draft", "Celtx", "Arc Studio"].forEach((n) => expect(within(travels).getByText(n)).toBeInTheDocument());
  expect(within(travels).getByText(/not because of any partnership/)).toBeInTheDocument();
  // No claim about what another product lacks.
  expect(document.body.textContent).not.toMatch(/doesn't|does not support|unlike|lacks/i);
});

it("keeps sign-up as the action", () => {
  render(<TourPage />);
  expect(screen.getByRole("link", { name: /Start writing — free/ })).toHaveAttribute("href", "/register");
});

it("speaks Nepali", () => {
  mockLang = "ne";
  render(<TourPage />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("एउटा दृश्य राम्रो हुँदै गरेको हेर्नुहोस्।");
  expect(screen.getByRole("button", { name: "पुनर्लेखित" })).toBeInTheDocument();
});
