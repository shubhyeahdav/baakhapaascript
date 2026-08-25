import React from "react";
import { render, screen } from "@testing-library/react";

/**
 * Nothing renews on its own.
 *
 * Khalti and eSewa take one payment once, so a plan bought through either just
 * stops. Without this notice a writer meets that as a 403 on a feature that
 * worked yesterday, which reads as the product breaking rather than a month
 * ending. A Stripe subscription must stay silent — Stripe owns its renewal, and
 * warning those users would be wrong.
 */

vi.mock("react-router-dom", () => ({
  // react-router renders `to` as `href`; the mock has to do the same or the
  // link assertion below tests the mock rather than the component.
  Link: ({ children, to, ...p }) => <a href={to} {...p}>{children}</a>,
}));

const mockUser = { current: null };
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

// eslint-disable-next-line import/first
import PlanNotice, { daysUntil } from "./PlanNotice";

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();
const withPlan = (expires) => {
  mockUser.current = { subscription_tier: "pro", subscription_expires_at: expires };
  return render(<PlanNotice />);
};

describe("daysUntil", () => {
  it("counts forward", () => {
    expect(daysUntil(inDays(3))).toBe(3);
  });

  it("goes negative once the date has passed", () => {
    expect(daysUntil(inDays(-2))).toBeLessThan(0);
  });

  it("returns null for no date and for nonsense", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil("not-a-date")).toBeNull();
  });
});

describe("when the notice appears", () => {
  it("stays silent on a plan with no expiry", () => {
    // A Stripe subscription, or a free account. Neither is about to lapse.
    const { container } = withPlan(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays silent while the month has a way to run", () => {
    const { container } = withPlan(inDays(20));
    expect(container).toBeEmptyDOMElement();
  });

  it("warns inside the last week", () => {
    withPlan(inDays(3));
    expect(screen.getByText(/ends in 3 days/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing renews on its own/i)).toBeInTheDocument();
  });

  it("uses the singular on the last day", () => {
    withPlan(inDays(1));
    expect(screen.getByText(/ends in 1 day\./i)).toBeInTheDocument();
  });

  it("says so once the plan has ended", () => {
    withPlan(inDays(-1));
    expect(screen.getByText(/your plan has ended/i)).toBeInTheDocument();
  });

  it("reassures that the work is safe, because that is the real fear", () => {
    withPlan(inDays(-1));
    expect(screen.getByText(/your work is safe/i)).toBeInTheDocument();
  });

  it("always offers the way to fix it", () => {
    withPlan(inDays(-1));
    expect(screen.getByText(/renew/i).closest("a")).toHaveAttribute("href", "/pricing");
  });
});
