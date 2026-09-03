import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Settings, and the one irreversible control in the whole product.
 *
 * A screenwriting tool holds unproduced work, so "stop storing my script" has to
 * be something a writer can do themselves rather than a support request. That
 * makes account deletion a real feature — and it also makes it the one button
 * where an accidental click cannot be walked back. The guard is a typed-email
 * confirmation, and the tests below pin every edge of it: it must accept the
 * writer's own address in any case they happen to type it, and it must refuse
 * anything else, including the near-misses (a trailing space is fine, a
 * different address is not).
 *
 * The deep-linked tab is the other thing worth pinning. `?tab=team` is what the
 * old Team nav item pointed at, so links to it exist outside this codebase; the
 * matching strips whitespace and ignores case for exactly that reason.
 */

const mockNavigate = vi.fn();
const mockQuery = { current: {} };
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [{ get: (k) => mockQuery.current[k] ?? null }],
  Link: ({ children, to, ...p }) => <a href={to} {...p}>{children}</a>,
}));

vi.mock("../services/api", () => ({
  projects: { getAll: vi.fn() },
  subscription: { usage: vi.fn() },
  auth: { deleteAccount: vi.fn() },
}));

const mockAuth = { current: {} };
vi.mock("../context/AuthContext", () => ({
  useAuth: () => mockAuth.current,
}));

// Both have their own concerns and their own tests; here they are scenery.
vi.mock("../components/TopNav", () => ({ default: () => <nav data-testid="topnav" /> }));
vi.mock("../components/TeamPanel", () => ({
  default: () => <div data-testid="team-panel" />,
}));

// eslint-disable-next-line import/first
import SettingsPage from "./SettingsPage";
// eslint-disable-next-line import/first
import { projects, subscription, auth as authApi } from "../services/api";

const logout = vi.fn();

beforeEach(() => {
  mockQuery.current = {};
  mockAuth.current = {
    user: {
      name: "Mira Shrestha", email: "mira@example.com",
      role: "writer", subscription_tier: "pro",
    },
    logout,
  };
  projects.getAll.mockResolvedValue({ data: [] });
  // The default is a paid plan with nothing spent yet.
  subscription.usage.mockResolvedValue({
    data: { period: "2026-09", spent_usd: 0, ceiling_usd: 6, remaining_usd: 6,
            metered: true },
  });
  authApi.deleteAccount.mockResolvedValue({});
});

const openDeleteFlow = () => {
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  return screen.getByLabelText("Confirm your email");
};

const deleteButton = () => screen.getByRole("button", { name: /Delete everything/ });

describe("tabs", () => {
  it("starts on Account", () => {
    render(<SettingsPage />);

    expect(screen.getByText("Role")).toBeInTheDocument();
  });

  it("deep-links to a tab from the query string", () => {
    // "?tab=teammembers" is what the old Team nav item linked to.
    mockQuery.current = { tab: "teammembers" };
    render(<SettingsPage />);

    expect(screen.getByTestId("team-panel")).toBeInTheDocument();
  });

  it("ignores case in the deep link", async () => {
    mockQuery.current = { tab: "APIUsage" };
    render(<SettingsPage />);

    expect(await screen.findByText("Minutes planned")).toBeInTheDocument();
  });

  it("matches a deep link written with a space", () => {
    // Both sides of the comparison have their whitespace stripped, so the
    // hand-written spelling works too. "?tab=team%20members" and
    // "?tab=team+members" both arrive here as "team members" once
    // URLSearchParams has decoded them.
    mockQuery.current = { tab: "team members" };
    render(<SettingsPage />);

    expect(screen.getByTestId("team-panel")).toBeInTheDocument();
  });

  it("falls back to Account for a tab that does not exist", () => {
    mockQuery.current = { tab: "billing" };
    render(<SettingsPage />);

    expect(screen.getByText("Role")).toBeInTheDocument();
  });

  it("switches tabs on click", () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Team Members" }));

    expect(screen.getByTestId("team-panel")).toBeInTheDocument();
    expect(screen.queryByText("Role")).not.toBeInTheDocument();
  });
});

describe("the account summary", () => {
  it("shows who is signed in", () => {
    render(<SettingsPage />);

    expect(screen.getByText("Mira Shrestha")).toBeInTheDocument();
    expect(screen.getByText("mira@example.com")).toBeInTheDocument();
  });

  it("falls back to editor when no role is set", () => {
    mockAuth.current = { user: { email: "x@y.z", subscription_tier: "pro" }, logout };
    render(<SettingsPage />);

    expect(screen.getByText("editor")).toBeInTheDocument();
  });

  it("offers an upgrade to a free account", () => {
    mockAuth.current = { user: { email: "x@y.z", subscription_tier: "free" }, logout };
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));

    expect(mockNavigate).toHaveBeenCalledWith("/pricing");
  });

  it("does not nag someone who has already paid", () => {
    render(<SettingsPage />);

    expect(screen.queryByRole("button", { name: "Upgrade" })).not.toBeInTheDocument();
  });

  it("signs out", () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(logout).toHaveBeenCalled();
  });
});

describe("deleting an account", () => {
  it("does not show the confirmation until it is asked for", () => {
    render(<SettingsPage />);

    expect(screen.queryByLabelText("Confirm your email")).not.toBeInTheDocument();
  });

  it("says exactly what goes and what stays", () => {
    // Projects shared with you belong to whoever owns them, and a writer about
    // to delete their account deserves to know that before they do it.
    render(<SettingsPage />);

    expect(screen.getByText(/Projects other people shared with you stay/))
      .toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it("refuses to act on an empty confirmation", () => {
    render(<SettingsPage />);
    openDeleteFlow();

    expect(deleteButton()).toBeDisabled();
  });

  it("refuses to act on somebody else's address", () => {
    render(<SettingsPage />);
    const input = openDeleteFlow();

    fireEvent.change(input, { target: { value: "someone@example.com" } });

    expect(deleteButton()).toBeDisabled();
  });

  it("accepts the writer's own address", () => {
    render(<SettingsPage />);
    const input = openDeleteFlow();

    fireEvent.change(input, { target: { value: "mira@example.com" } });

    expect(deleteButton()).toBeEnabled();
  });

  it("accepts it in any case, because nobody types their own address carefully", () => {
    render(<SettingsPage />);
    const input = openDeleteFlow();

    fireEvent.change(input, { target: { value: "MIRA@Example.COM" } });

    expect(deleteButton()).toBeEnabled();
  });

  it("tolerates surrounding whitespace from a paste", () => {
    render(<SettingsPage />);
    const input = openDeleteFlow();

    fireEvent.change(input, { target: { value: "  mira@example.com  " } });

    expect(deleteButton()).toBeEnabled();
  });

  it("sends the trimmed address and signs the writer out", async () => {
    render(<SettingsPage />);
    const input = openDeleteFlow();
    fireEvent.change(input, { target: { value: "  mira@example.com " } });

    fireEvent.click(deleteButton());

    await waitFor(() => expect(authApi.deleteAccount).toHaveBeenCalledWith("mira@example.com"));
    await waitFor(() => expect(logout).toHaveBeenCalled());
  });

  it("backs out cleanly, leaving nothing typed behind", () => {
    render(<SettingsPage />);
    const input = openDeleteFlow();
    fireEvent.change(input, { target: { value: "mira@example.com" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    openDeleteFlow();

    expect(screen.getByLabelText("Confirm your email")).toHaveValue("");
  });

  it("reports a refusal from the server and lets the writer try again", async () => {
    authApi.deleteAccount.mockRejectedValue({
      response: { data: { detail: "Transfer or delete your shared projects first." } },
    });
    render(<SettingsPage />);
    const input = openDeleteFlow();
    fireEvent.change(input, { target: { value: "mira@example.com" } });

    fireEvent.click(deleteButton());

    expect(await screen.findByText("Transfer or delete your shared projects first."))
      .toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
    await waitFor(() => expect(deleteButton()).toBeEnabled());
  });

  it("has a message of its own when the server offers none", async () => {
    authApi.deleteAccount.mockRejectedValue({});
    render(<SettingsPage />);
    const input = openDeleteFlow();
    fireEvent.change(input, { target: { value: "mira@example.com" } });

    fireEvent.click(deleteButton());

    expect(await screen.findByText("Could not delete the account.")).toBeInTheDocument();
  });
});

describe("usage", () => {
  const showUsage = () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "API Usage" }));
  };

  it("counts what it actually knows", async () => {
    projects.getAll.mockResolvedValue({
      data: [
        { status: "finalized", duration_minutes: 15 },
        { status: "draft", duration_minutes: 5 },
        { status: "draft", duration_minutes: 0 },
      ],
    });
    showUsage();

    expect(await screen.findByText("Minutes planned")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();  // minutes
    expect(screen.getByText("Finalized").previousSibling).toHaveTextContent("1");
  });

  it("treats a project with no duration as zero rather than NaN", async () => {
    projects.getAll.mockResolvedValue({ data: [{ status: "draft" }] });
    showUsage();

    await screen.findByText("Minutes planned");
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
  });

  it("no longer claims per-call metering does not exist", async () => {
    /* It did not, and the page said so, which was the honest thing at the
       time. It does now, so the disclaimer had to go — a page describing a
       feature the product lacks is honest; one describing a lack the product
       no longer has is just wrong. */
    showUsage();

    await screen.findByText("Minutes planned");
    expect(screen.queryByText(/isn't tracked yet/)).toBeNull();
  });

  it("says so when the projects list cannot be loaded", async () => {
    projects.getAll.mockRejectedValue(new Error("network"));
    showUsage();

    expect(await screen.findByText("Could not load usage data.")).toBeInTheDocument();
  });
});

/**
 * The monthly generation ceiling.
 *
 * This section used to say per-call AI metering "isn't tracked yet". It is now,
 * and a page that describes a feature the product has is worse than one that
 * describes a feature it lacks — the second is honest.
 */
describe("AI generation this month", () => {
  const openUsage = async (usage) => {
    if (usage === null) subscription.usage.mockRejectedValue(new Error("nope"));
    else if (usage) subscription.usage.mockResolvedValue({ data: usage });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: /usage/i }));
  };

  it("shows what has been spent against the ceiling", async () => {
    await openUsage({ period: "2026-09", spent_usd: 1.5, ceiling_usd: 6,
                      remaining_usd: 4.5, metered: true });

    expect(await screen.findByText(/\$1\.50 \/ \$6\.00/)).toBeInTheDocument();
    expect(screen.getByText(/AI generation · 2026-09/)).toBeInTheDocument();
  });

  it("says what the ceiling does and does not stop", async () => {
    /* The sentence a writer needs when they hit it: the parts of the product
       that do not call a model keep working. */
    await openUsage({ period: "2026-09", spent_usd: 6, ceiling_usd: 6,
                      remaining_usd: 0, metered: true });

    expect(
      await screen.findByText(/craft panel, the linter, the review/i),
    ).toBeInTheDocument();
  });

  it("tells a free user why there is nothing to meter", async () => {
    /* Not 'you have used 0 of 0'. The free plan does not call a model at all,
       and saying so explains why the craft panel is still free. */
    await openUsage({ period: "2026-09", spent_usd: 0, ceiling_usd: 0,
                     remaining_usd: 0, metered: false });

    expect(
      await screen.findByText(/not metered on the free plan/i),
    ).toBeInTheDocument();
  });

  it("shows no spend figure at all when the request fails", async () => {
    /* A spend figure that might be wrong is worse than none. */
    await openUsage(null);

    expect(screen.queryByText(/AI generation ·/)).toBeNull();
  });
});
