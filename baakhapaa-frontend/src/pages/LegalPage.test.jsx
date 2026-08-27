import React from "react";
import { render, screen } from "@testing-library/react";

/**
 * The Terms and the Privacy Policy, served inside the app.
 *
 * Both documents existed at the repo root and were reachable from nowhere,
 * while the product collected accounts, stored unproduced scripts and sent
 * them to two AI providers. A policy nobody can read is not a policy.
 *
 * The draft banner is the load-bearing part. Both files are still the
 * unreviewed templates `LEGAL_REVIEW.md` describes and carry a literal
 * `[DATE]`. Serving them without saying so would dress a template up as a
 * reviewed policy, which is worse than the gap it closes.
 */

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...p }) => <a href={to} {...p}>{children}</a>,
}));

vi.mock("virtual:legal-documents", () => ({
  terms: "# Terms of Use\n\n**Last updated: [DATE]**\n\n## 1. Acceptance\n\nBy using it you agree.\n",
  privacy: "# Privacy Policy\n\nWe collect **your email**.\n\n- One thing\n- Another thing\n\n[Read more](https://example.com)\n",
}));

// eslint-disable-next-line import/first
import LegalPage from "./LegalPage";

describe("which document is shown", () => {
  it("renders the terms", () => {
    render(<LegalPage doc="terms" />);

    expect(screen.getByRole("heading", { name: "Terms of Use" })).toBeInTheDocument();
  });

  it("renders the privacy policy", () => {
    render(<LegalPage doc="privacy" />);

    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
  });

  it("falls back to the terms for an unknown document", () => {
    render(<LegalPage doc="nonsense" />);

    expect(screen.getByRole("heading", { name: "Terms of Use" })).toBeInTheDocument();
  });

  it("links to the other document, so the pair is navigable", () => {
    render(<LegalPage doc="terms" />);

    expect(screen.getByText("Privacy Policy").closest("a")).toHaveAttribute("href", "/privacy");
  });

  it("offers the way onward to signing up", () => {
    render(<LegalPage doc="terms" />);

    expect(screen.getByText("Create account").closest("a")).toHaveAttribute("href", "/register");
  });
});

describe("the draft banner", () => {
  it("says a template is a draft rather than letting it pass as policy", () => {
    render(<LegalPage doc="terms" />);

    expect(screen.getByText(/Draft\./)).toBeInTheDocument();
    expect(screen.getByText(/not been reviewed by a lawyer/)).toBeInTheDocument();
  });

  it("stays quiet once the placeholder is gone", () => {
    // The banner keys off `[DATE]`, so filling the date in retires it.
    render(<LegalPage doc="privacy" />);

    expect(screen.queryByText(/not been reviewed by a lawyer/)).not.toBeInTheDocument();
  });
});

describe("the markdown subset", () => {
  it("renders bold", () => {
    render(<LegalPage doc="privacy" />);

    expect(screen.getByText("your email").tagName).toBe("STRONG");
  });

  it("renders bullet lists", () => {
    render(<LegalPage doc="privacy" />);

    expect(screen.getByText("One thing").tagName).toBe("LI");
    expect(screen.getByText("Another thing")).toBeInTheDocument();
  });

  it("renders links with their href", () => {
    render(<LegalPage doc="privacy" />);

    expect(screen.getByText("Read more")).toHaveAttribute("href", "https://example.com");
  });

  it("renders nested headings at their own level", () => {
    render(<LegalPage doc="terms" />);

    expect(screen.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "1. Acceptance" })).toBeInTheDocument();
  });

  it("escapes HTML in the source rather than executing it", () => {
    // These are our own files, but a renderer that trusts its input is one
    // copy-paste away from being the place a script tag lands.
    render(<LegalPage doc="terms" />);

    expect(document.querySelector("script")).toBeNull();
  });
});

it("does not show the reader a [DATE] placeholder", () => {
  // A placeholder where a date belongs looks like a bug and tells the reader
  // nothing. The draft banner already carries that information honestly.
  render(<LegalPage doc="terms" />);

  expect(document.body.textContent).not.toContain("[DATE]");
  expect(screen.getByText(/not yet in force/)).toBeInTheDocument();
});
