import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";

/**
 * Where every gateway drops the writer back after they have paid.
 *
 * This is the page someone is looking at with money already gone from their
 * account, so the wrong words here are expensive in a way most UI copy is not.
 * Two behaviours carry that weight and both are tested below.
 *
 * First: "pending" is a real outcome, not a failure. Wallet confirmations lag,
 * and telling a writer their payment failed while the money is in flight invites
 * them to pay twice. The page has to distinguish four server verdicts —
 * completed, pending, underpaid, failed — and say something different and
 * correct for each.
 *
 * Second: nothing on this page decides whether the payment worked. The query
 * string arrives from the browser we are talking to, so a `status=Completed` in
 * it is worth nothing; the page forwards the whole thing to the server and
 * reports what the server says the gateway said. The test that the verdict comes
 * from the response and not the query string is the one that matters most here.
 */

const mockNavigate = vi.fn();
const mockQuery = { current: {} };
const mockParams = { current: { provider: "khalti" } };

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams.current,
  useSearchParams: () => [{
    get: (k) => mockQuery.current[k] ?? null,
    forEach: (fn) => Object.entries(mockQuery.current).forEach(([k, v]) => fn(v, k)),
  }],
  Link: ({ children, to, ...p }) => <a href={to} {...p}>{children}</a>,
}));

vi.mock("../services/api", () => ({
  subscription: { verify: vi.fn() },
}));

const refreshUser = vi.fn();
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ refreshUser }),
}));

// eslint-disable-next-line import/first
import PaymentReturn from "./PaymentReturn";
// eslint-disable-next-line import/first
import { subscription } from "../services/api";

beforeEach(() => {
  // `mockReset: true` wipes implementations between tests, so every stub is
  // installed here rather than in the vi.mock factory above.
  mockQuery.current = { pidx: "abc123" };
  mockParams.current = { provider: "khalti" };
  refreshUser.mockResolvedValue(undefined);
  subscription.verify.mockResolvedValue({ data: { status: "pending" } });
});

const renderWith = (data) => {
  subscription.verify.mockResolvedValue({ data });
  return render(<PaymentReturn />);
};

describe("while it is checking", () => {
  it("says so, and asks the writer not to close the page", async () => {
    subscription.verify.mockReturnValue(new Promise(() => {}));  // never settles
    render(<PaymentReturn />);

    expect(await screen.findByText(/Confirming your payment/)).toBeInTheDocument();
    expect(screen.getByText(/don't close this page/i)).toBeInTheDocument();
  });

  it("offers no escape routes yet, so nobody navigates away mid-check", () => {
    subscription.verify.mockReturnValue(new Promise(() => {}));
    render(<PaymentReturn />);

    expect(screen.queryByText("Back to Dashboard")).not.toBeInTheDocument();
  });
});

describe("what gets sent to the server", () => {
  it("forwards the provider from the path and the whole query string", async () => {
    mockParams.current = { provider: "esewa" };
    mockQuery.current = { data: "eyJ0IjoxfQ==", transaction_uuid: "BKP-1" };
    renderWith({ status: "completed", tier: "pro" });

    await waitFor(() => expect(subscription.verify).toHaveBeenCalled());
    expect(subscription.verify).toHaveBeenCalledWith("esewa", {
      data: "eyJ0IjoxfQ==", transaction_uuid: "BKP-1",
    });
  });

  it("falls back to ?provider= for a payment already in flight when this deployed", async () => {
    mockParams.current = {};
    mockQuery.current = { provider: "stripe", session_id: "cs_1" };
    renderWith({ status: "completed", tier: "pro" });

    await waitFor(() => expect(subscription.verify).toHaveBeenCalled());
    expect(subscription.verify.mock.calls[0][0]).toBe("stripe");
  });

  it("verifies exactly once, because a re-verify would poll the gateway", async () => {
    // React StrictMode mounts twice in development; the `started` ref guards it.
    const { rerender } = renderWith({ status: "completed", tier: "pro" });
    await waitFor(() => expect(subscription.verify).toHaveBeenCalledTimes(1));

    rerender(<PaymentReturn />);

    expect(subscription.verify).toHaveBeenCalledTimes(1);
  });

  it("does not call the server at all with no provider anywhere", async () => {
    mockParams.current = {};
    mockQuery.current = {};
    render(<PaymentReturn />);

    expect(await screen.findByText(/without a payment to check/)).toBeInTheDocument();
    expect(subscription.verify).not.toHaveBeenCalled();
  });
});

describe("a confirmed payment", () => {
  it("names the plan that is now active", async () => {
    renderWith({ status: "completed", tier: "studio" });

    expect(await screen.findByText("Payment confirmed")).toBeInTheDocument();
    expect(screen.getByText("studio")).toBeInTheDocument();
  });

  it("shows when a time-boxed plan runs until", async () => {
    // Khalti and eSewa buy one month at a time, so the date is the whole point.
    renderWith({
      status: "completed", tier: "pro", expires_at: "2026-09-25T00:00:00Z",
    });

    await screen.findByText("Payment confirmed");
    expect(screen.getByText(/It runs until/)).toBeInTheDocument();
  });

  it("says nothing about an end date for a Stripe subscription", async () => {
    // A null expiry means "not time-boxed" — Stripe owns the renewal. Printing
    // a date here, or the word "null", would both be wrong.
    renderWith({ status: "completed", tier: "pro", expires_at: null });

    await screen.findByText("Payment confirmed");
    expect(screen.queryByText(/It runs until/)).not.toBeInTheDocument();
  });

  it("ignores an unparseable date rather than printing Invalid Date", async () => {
    renderWith({ status: "completed", tier: "pro", expires_at: "not-a-date" });

    await screen.findByText("Payment confirmed");
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });

  it("refreshes the cached user, whose tier is now stale", async () => {
    renderWith({ status: "completed", tier: "pro" });

    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it("does not offer Try again to someone who has already paid", async () => {
    renderWith({ status: "completed", tier: "pro" });

    await screen.findByText("Payment confirmed");
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });

  it("moves on to the dashboard by itself", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      renderWith({ status: "completed", tier: "pro" });
      await vi.waitFor(() => expect(refreshUser).toHaveBeenCalled());

      await act(async () => { vi.advanceTimersByTime(2600); });

      expect(mockNavigate).toHaveBeenCalledWith("/dashboard?checkout=success");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("an unconfirmed payment", () => {
  it("does not call a lagging wallet confirmation a failure", async () => {
    // The costly mistake: money has left the account and we say it failed, so
    // the writer pays a second time.
    renderWith({ status: "pending", detail: "Khalti reports this as Initiated." });

    expect(await screen.findByText("Not confirmed yet")).toBeInTheDocument();
    expect(screen.getByText(/reopen this page from Settings rather than paying again/))
      .toBeInTheDocument();
  });

  it("passes the gateway's own explanation through", async () => {
    renderWith({ status: "pending", detail: "Khalti reports this as Initiated." });

    expect(await screen.findByText("Khalti reports this as Initiated.")).toBeInTheDocument();
  });

  it("says plainly that an underpayment activated nothing and charged nothing more", async () => {
    renderWith({ status: "underpaid" });

    expect(await screen.findByText(/Amount didn't match/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing further has been charged/)).toBeInTheDocument();
  });

  it("reassures that a failure charged nothing", async () => {
    renderWith({ status: "failed" });

    expect(await screen.findByText("Payment not completed")).toBeInTheDocument();
    expect(screen.getByText(/Nothing was charged/)).toBeInTheDocument();
  });

  it("offers a way forward", async () => {
    renderWith({ status: "failed" });

    await screen.findByText("Payment not completed");
    expect(screen.getByText("Try again").closest("a")).toHaveAttribute("href", "/pricing");
    expect(screen.getByText("Back to Dashboard").closest("a"))
      .toHaveAttribute("href", "/dashboard");
  });

  it("treats a verdict it does not recognise as not completed", async () => {
    renderWith({ status: "something-new" });

    expect(await screen.findByText("Payment not completed")).toBeInTheDocument();
  });
});

describe("when the server cannot be reached", () => {
  it("says the check failed rather than that the payment did", async () => {
    subscription.verify.mockRejectedValue({});
    render(<PaymentReturn />);

    expect(await screen.findByText(/could not reach the server to confirm/))
      .toBeInTheDocument();
  });

  it("prefers the server's own message when there is one", async () => {
    subscription.verify.mockRejectedValue({
      response: { data: { detail: "No matching payment was started from this account." } },
    });
    render(<PaymentReturn />);

    expect(await screen.findByText("No matching payment was started from this account."))
      .toBeInTheDocument();
  });
});

describe("the query string is not evidence", () => {
  it("reports failure even when the URL claims the payment completed", async () => {
    // The single most important behaviour on this page. Everything in the query
    // string was written by the browser we received it from; a page that trusted
    // it would grant a plan to anyone who could edit their own address bar.
    mockQuery.current = { pidx: "abc123", status: "Completed", amount: "99900" };
    renderWith({ status: "failed", detail: "Khalti reports this as User canceled." });

    expect(await screen.findByText("Payment not completed")).toBeInTheDocument();
    expect(screen.queryByText("Payment confirmed")).not.toBeInTheDocument();
  });
});
