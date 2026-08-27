import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * The pricing page can no longer assume a single gateway.
 *
 * Stripe declines most Nepali cards, so a Nepal deployment sells through Khalti
 * or eSewa and an international one through Stripe — and which of those are
 * configured is a property of the deployment, not of this file. The two cases
 * worth pinning down are that the choice is offered when there is one, and that
 * eSewa's form POST is not sent down the redirect path: eSewa signs form values,
 * so `window.location.href = url` would drop the signature and every payment
 * would fail with an error naming nothing.
 */

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock("../services/api", () => ({
  subscription: { providers: vi.fn(), checkout: vi.fn() },
}));

// eslint-disable-next-line import/first
import { subscription } from "../services/api";
// eslint-disable-next-line import/first
import PricingPage from "./PricingPage";

const ALL_THREE = {
  data: {
    default: "khalti",
    providers: [
      { key: "khalti", name: "Khalti", description: "Khalti wallet", mode: "live", live: true },
      { key: "esewa", name: "eSewa", description: "eSewa wallet", mode: "sandbox", live: false },
      { key: "stripe", name: "Card (Stripe)", description: "International cards", mode: "demo", live: false },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  subscription.providers.mockResolvedValue(ALL_THREE);
});

test("offers every gateway the deployment can take money through", async () => {
  render(<PricingPage />);
  await waitFor(() => expect(screen.getByText("Khalti")).toBeInTheDocument());
  expect(screen.getByText("eSewa")).toBeInTheDocument();
  expect(screen.getByText("Card (Stripe)")).toBeInTheDocument();
});

test("a sandbox gateway and a simulated one do not read the same", async () => {
  // The difference is the whole point: a sandbox payment reaches the real
  // gateway and proves the integration; a simulated one never leaves our
  // server. Collapsing both into "test mode" hides an unexercised integration.
  render(<PricingPage />);
  await waitFor(() => expect(screen.getByText("Card (Stripe)")).toBeInTheDocument());
  expect(screen.getByText("Sandbox — real gateway, no real money")).toBeInTheDocument();
  expect(screen.getByText("Simulated — no gateway contacted")).toBeInTheDocument();
  // A live gateway shows what it is, not a caveat.
  expect(screen.getByText("Khalti wallet")).toBeInTheDocument();
});

test("checkout uses the server's default until the writer picks another", async () => {
  subscription.checkout.mockResolvedValue({ data: { kind: "redirect", url: "https://pay/x" } });
  delete window.location;
  window.location = { href: "" };

  render(<PricingPage />);
  await waitFor(() => expect(screen.getByText("Khalti")).toBeInTheDocument());
  fireEvent.click(screen.getByText("Go Pro"));

  await waitFor(() => expect(subscription.checkout).toHaveBeenCalledWith("pro", "khalti"));
});

test("choosing a gateway sends the checkout through that one", async () => {
  subscription.checkout.mockResolvedValue({ data: { kind: "redirect", url: "https://pay/x" } });
  delete window.location;
  window.location = { href: "" };

  render(<PricingPage />);
  await waitFor(() => expect(screen.getByText("eSewa")).toBeInTheDocument());
  fireEvent.click(screen.getByText("eSewa"));
  fireEvent.click(screen.getByText("Go Studio"));

  await waitFor(() => expect(subscription.checkout).toHaveBeenCalledWith("studio", "esewa"));
});

test("a form_post response is submitted as a form, not followed as a URL", async () => {
  // eSewa's signature covers the form values. Redirecting instead of posting
  // drops them, and eSewa rejects the payment without saying why.
  subscription.checkout.mockResolvedValue({
    data: {
      kind: "form_post",
      action: "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
      fields: { total_amount: "999.00", transaction_uuid: "BKP-abc", signature: "sig" },
    },
  });
  const submit = vi.fn();
  // eslint-disable-next-line no-undef
  HTMLFormElement.prototype.submit = submit;

  render(<PricingPage />);
  await waitFor(() => expect(screen.getByText("eSewa")).toBeInTheDocument());
  fireEvent.click(screen.getByText("Go Pro"));

  await waitFor(() => expect(submit).toHaveBeenCalled());
  const form = document.querySelector("form[action*='esewa']");
  expect(form).not.toBeNull();
  expect(form.querySelector("input[name='signature']").value).toBe("sig");
});

test("the free tier never opens a checkout", async () => {
  render(<PricingPage />);
  await waitFor(() => expect(screen.getByText("Khalti")).toBeInTheDocument());
  fireEvent.click(screen.getByText("Start Writing"));

  expect(subscription.checkout).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
});

test("a pricing page that cannot reach the API still renders its prices", async () => {
  // Someone comparing plans should not see a blank page because /providers 500'd.
  subscription.providers.mockRejectedValue(new Error("network"));
  render(<PricingPage />);
  await waitFor(() => expect(screen.getByText("Rs. 999")).toBeInTheDocument());
  expect(screen.getByText("Rs. 2,499")).toBeInTheDocument();
});

describe("the pricing page only claims what the build delivers", () => {
  /**
   * The buying surface is the one place a wrong feature list costs money
   * directly — a refund and a bad review rather than a shrug. Three claims
   * were wrong on 2026-08-26: Studio advertised "Real-time collaboration"
   * (descoped that same day), a ten-seat cap (enforced nowhere), and priority
   * support (no channel exists); Pro claimed version history, which is free.
   *
   * These tests are deliberately about *absence*. They cannot verify the
   * backend from here, so they pin the specific untrue sentences instead —
   * enough that restoring one is a decision someone makes against a failing
   * test rather than by pasting an old list back.
   */
  const body = () => document.body.textContent;

  it("does not sell real-time collaboration, which is not built", () => {
    render(<PricingPage />);

    expect(body()).not.toMatch(/real[- ]time collaboration/i);
  });

  it("does not promise a seat cap nothing enforces", () => {
    render(<PricingPage />);

    expect(body()).not.toMatch(/up to \d+ team members/i);
  });

  it("does not promise a support tier that has no channel", () => {
    render(<PricingPage />);

    expect(body()).not.toMatch(/priority support/i);
  });

  it("names the course on the free tier, since it is free and is the differentiator", () => {
    // 19 lessons across two tracks, ungated. Omitting it undersold the free
    // tier as a trial when it is a usable product.
    render(<PricingPage />);

    expect(body()).toMatch(/course/i);
  });

  it("names Final Draft export as free, because the code makes it free", () => {
    // A free tier a script cannot leave is a trap; .fdx is the only export
    // another screenwriting tool can actually edit.
    render(<PricingPage />);

    expect(body()).toMatch(/final draft/i);
  });

  it("lists version history under the free tier, where it actually lives", () => {
    // It is ungated in the backend. Claiming it as paid made the whole list
    // suspect; the fix is that it appears in the Rs. 0 card. Scoped to that
    // card rather than matched by proximity in the page text — the tier names
    // and features sit close enough together that a distance regex proves
    // nothing.
    render(<PricingPage />);

    const freeCard = screen.getByText("Rs. 0").closest("div.rounded-2xl, div[class*='rounded']");
    expect(freeCard.textContent).toMatch(/version history/i);
  });
});

describe("what each tier now actually buys", () => {
  const body = () => document.body.textContent;

  it("gives Studio a differentiator, since it previously had none", () => {
    // `PAID_TIERS` held both paid tiers and nothing branched on studio, so it
    // cost Rs 1,500/month more than Pro for nothing. Seats are enforced in
    // `membership.SEAT_LIMITS` against the project owner's plan.
    render(<PricingPage />);

    expect(body()).toMatch(/unlimited collaborators/i);
  });

  it("states each tier's seat allowance, all three enforced server-side", () => {
    render(<PricingPage />);

    expect(body()).toMatch(/up to 2 collaborators/i);
    expect(body()).toMatch(/up to 5 collaborators/i);
    expect(body()).toMatch(/unlimited collaborators/i);
  });

  it("gives the free tier room to finish the course and keep writing", () => {
    // The course ends by asking for a complete short. At one project, finishing
    // it spent the whole allowance — a wall at the moment a writer is most
    // persuaded and least able to act.
    render(<PricingPage />);

    expect(body()).toMatch(/3 active projects/i);
  });
});
