import React from "react";
import { render, screen } from "@testing-library/react";

/**
 * The gate in front of every authenticated page.
 *
 * Three states get confused with each other constantly in this pattern, and two
 * of the confusions are user-visible bugs. Treating "still checking the token"
 * as "not logged in" bounces a returning user to the login screen on every hard
 * refresh. Sending an un-onboarded user to /onboarding without exempting
 * /onboarding itself makes that page redirect to itself forever — a white screen
 * the user cannot escape by any route.
 *
 * Both are one missing condition away at all times, which is why this 28-line
 * component earns a test file.
 */

const mockLocation = { current: { pathname: "/dashboard" } };
vi.mock("react-router-dom", () => ({
  // A marker rather than real navigation: what matters is that a redirect was
  // requested and where to, not that a router carried it out.
  Navigate: ({ to, replace }) => (
    <div data-testid="redirect" data-to={to} data-replace={String(!!replace)} />
  ),
  useLocation: () => mockLocation.current,
}));

const mockAuth = { current: {} };
vi.mock("../context/AuthContext", () => ({
  useAuth: () => mockAuth.current,
}));

// eslint-disable-next-line import/first
import ProtectedRoute from "./ProtectedRoute";

const Guarded = () => <div>The protected page</div>;

const renderAt = (pathname, auth) => {
  mockLocation.current = { pathname };
  mockAuth.current = auth;
  return render(<ProtectedRoute><Guarded /></ProtectedRoute>);
};

const onboarded = (value) => ({
  isAuthenticated: true,
  isLoading: false,
  user: { preferences: { onboarded: value } },
});

describe("while the session is still being checked", () => {
  it("waits instead of deciding", () => {
    renderAt("/dashboard", { isAuthenticated: false, isLoading: true, user: null });

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByTestId("redirect")).not.toBeInTheDocument();
  });

  it("does not show the page yet either", () => {
    renderAt("/dashboard", { isAuthenticated: true, isLoading: true, user: null });

    expect(screen.queryByText("The protected page")).not.toBeInTheDocument();
  });
});

describe("when nobody is signed in", () => {
  it("redirects to login", () => {
    renderAt("/dashboard", { isAuthenticated: false, isLoading: false, user: null });

    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/login");
  });

  it("replaces the history entry, so Back does not return to the guarded page", () => {
    renderAt("/dashboard", { isAuthenticated: false, isLoading: false, user: null });

    expect(screen.getByTestId("redirect")).toHaveAttribute("data-replace", "true");
  });

  it("never renders the guarded page", () => {
    renderAt("/dashboard", { isAuthenticated: false, isLoading: false, user: null });

    expect(screen.queryByText("The protected page")).not.toBeInTheDocument();
  });
});

describe("onboarding", () => {
  it("sends a user who has never answered the questions to onboarding", () => {
    renderAt("/dashboard", onboarded(false));

    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/onboarding");
  });

  it("treats a missing preferences object as not yet onboarded", () => {
    renderAt("/dashboard", {
      isAuthenticated: true, isLoading: false, user: {},
    });

    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/onboarding");
  });

  it("renders onboarding itself rather than redirecting to it forever", () => {
    // The loop. Without the pathname check this redirect fires on /onboarding
    // too, and the user gets a white screen no route can escape.
    renderAt("/onboarding", onboarded(false));

    expect(screen.queryByTestId("redirect")).not.toBeInTheDocument();
    expect(screen.getByText("The protected page")).toBeInTheDocument();
  });

  it("lets an onboarded user through", () => {
    renderAt("/dashboard", onboarded(true));

    expect(screen.getByText("The protected page")).toBeInTheDocument();
    expect(screen.queryByTestId("redirect")).not.toBeInTheDocument();
  });

  it("does not send an onboarded user back to onboarding, since skip is permanent", () => {
    // Skipping sets onboarded:true precisely so it is a decision, not a prompt
    // the writer has to dismiss on every navigation.
    renderAt("/dashboard", onboarded(true));

    expect(screen.queryByTestId("redirect")).not.toBeInTheDocument();
  });
});
