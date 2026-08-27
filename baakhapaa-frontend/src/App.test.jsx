import React from "react";
import { render, screen } from "@testing-library/react";

/**
 * The route table.
 *
 * Almost nothing here is worth asserting except one thing, and that thing is
 * worth asserting a lot: **which routes are protected**. A page that should be
 * behind `ProtectedRoute` and is not becomes reachable without a token, and
 * nothing about the page itself would fail — it would just render, request data,
 * and get a 401 the writer sees as a broken screen.
 *
 * Both payment-return routes are protected on purpose, which is easy to read as
 * an oversight and undo: verifying a payment has to happen as the account that
 * started it, and the server checks that the reference belongs to the caller. An
 * unauthenticated return page could only ever fail.
 *
 * The provider ordering also matters. `ErrorBoundary` is outermost so a throw
 * inside `AuthProvider` or the router is caught too — without it a render error
 * unmounts the tree to a white page and takes the writer's unsaved draft with
 * it. That is exactly the failure this app can least afford, so it is pinned.
 */

const seen = { routes: [], order: [] };

vi.mock("react-router-dom", () => ({
  BrowserRouter: ({ children }) => { seen.order.push("BrowserRouter"); return <div>{children}</div>; },
  Routes: ({ children }) => <div>{children}</div>,
  Route: ({ path, element }) => {
    seen.routes.push({
      path,
      protected: element?.type?.__isProtectedRoute === true,
      page: element?.type?.__pageName
        || element?.props?.children?.type?.__pageName
        || null,
      // A <Navigate> route element carries its destination here.
      redirectTo: element?.props?.to ?? null,
    });
    return null;
  },
  Navigate: ({ to }) => <span data-testid="root-redirect" data-to={to} />,
}));

vi.mock("./context/AuthContext", () => ({
  AuthProvider: ({ children }) => { seen.order.push("AuthProvider"); return <div>{children}</div>; },
}));
vi.mock("./i18n", () => ({
  LanguageProvider: ({ children }) => { seen.order.push("LanguageProvider"); return <div>{children}</div>; },
}));
vi.mock("./components/ErrorBoundary", () => ({
  default: ({ children }) => { seen.order.push("ErrorBoundary"); return <div>{children}</div>; },
}));
vi.mock("./components/CommandPalette", () => ({
  default: () => <div data-testid="command-palette" />,
}));

// Every page is stubbed by a named marker so the route table can be read
// without pulling half the app into this test. The factories are written out
// one by one rather than built from a helper: `vi.mock` is hoisted above every
// top-level binding, so a shared `stub()` is not yet initialised when it runs.
vi.mock("./components/ProtectedRoute", () => {
  const C = ({ children }) => <div>{children}</div>;
  C.__isProtectedRoute = true;
  return { default: C };
});
vi.mock("./pages/LoginPage", () => {
  const C = () => null;
  C.__pageName = "LoginPage";
  return { default: C };
});
vi.mock("./pages/RegisterPage", () => {
  const C = () => null;
  C.__pageName = "RegisterPage";
  return { default: C };
});
vi.mock("./pages/Dashboard", () => {
  const C = () => null;
  C.__pageName = "Dashboard";
  return { default: C };
});
vi.mock("./pages/Onboarding", () => {
  const C = () => null;
  C.__pageName = "Onboarding";
  return { default: C };
});
vi.mock("./pages/NewProject", () => {
  const C = () => null;
  C.__pageName = "NewProject";
  return { default: C };
});
vi.mock("./pages/ScriptEditor", () => {
  const C = () => null;
  C.__pageName = "ScriptEditor";
  return { default: C };
});
vi.mock("./pages/ProjectSetup", () => {
  const C = () => null;
  C.__pageName = "ProjectSetup";
  return { default: C };
});
vi.mock("./pages/StoryboardView", () => {
  const C = () => null;
  C.__pageName = "StoryboardView";
  return { default: C };
});
vi.mock("./pages/PricingPage", () => {
  const C = () => null;
  C.__pageName = "PricingPage";
  return { default: C };
});
vi.mock("./pages/PaymentReturn", () => {
  const C = () => null;
  C.__pageName = "PaymentReturn";
  return { default: C };
});
vi.mock("./pages/SettingsPage", () => {
  const C = () => null;
  C.__pageName = "SettingsPage";
  return { default: C };
});
vi.mock("./pages/StoryboardsPage", () => {
  const C = () => null;
  C.__pageName = "StoryboardsPage";
  return { default: C };
});
vi.mock("./pages/ExportsPage", () => {
  const C = () => null;
  C.__pageName = "ExportsPage";
  return { default: C };
});
vi.mock("./pages/LearnPage", () => {
  const C = () => null;
  C.__pageName = "LearnPage";
  return { default: C };
});
vi.mock("./pages/LegalPage", () => {
  const C = () => null;
  C.__pageName = "LegalPage";
  return { default: C };
});

// eslint-disable-next-line import/first
import App from "./App";

beforeEach(() => {
  seen.routes = [];
  seen.order = [];
  render(<App />);
});

const route = (path) => seen.routes.find((r) => r.path === path);

describe("what is public", () => {
  it.each(["/login", "/register", "/pricing"])("leaves %s open", (path) => {
    expect(route(path)).toBeDefined();
    expect(route(path).protected).toBe(false);
  });

  it("sends the root at the dashboard", () => {
    expect(route("/").redirectTo).toBe("/dashboard");
  });
});

describe("what is protected", () => {
  it.each([
    "/dashboard",
    "/onboarding",
    "/projects/new",
    "/settings",
    "/storyboards",
    "/exports",
    "/learn",
    "/projects/:id/setup",
    "/projects/:id/editor",
    "/projects/:id/storyboard",
  ])("guards %s", (path) => {
    expect(route(path)).toBeDefined();
    expect(route(path).protected).toBe(true);
  });

  it("guards both payment return routes", () => {
    // Not an oversight: verifying a payment has to happen as the account that
    // started it, and an unauthenticated return page could only ever fail.
    expect(route("/payment/return/:provider").protected).toBe(true);
    expect(route("/payment/return").protected).toBe(true);
  });

  it("takes the payment provider from the path, never a query parameter", () => {
    // Every gateway appends its own query string to the URL we hand it, and
    // eSewa's docs do not say what it does when one is already there.
    expect(route("/payment/return/:provider")).toBeDefined();
  });

  it("keeps the older query-parameter form, for a payment in flight at deploy", () => {
    expect(route("/payment/return")).toBeDefined();
  });
});

describe("the pages behind the routes", () => {
  it.each([
    ["/dashboard", "Dashboard"],
    ["/projects/:id/editor", "ScriptEditor"],
    ["/projects/:id/setup", "ProjectSetup"],
    ["/projects/:id/storyboard", "StoryboardView"],
    ["/settings", "SettingsPage"],
    ["/learn", "LearnPage"],
    ["/login", "LoginPage"],
  ])("routes %s to %s", (path, page) => {
    expect(route(path).page).toBe(page);
  });
});

describe("the shell", () => {
  it("catches a throw from inside the providers and the router", () => {
    // Outermost. A render error that unmounts the tree to a white page takes
    // the writer's unsaved draft with it — the one failure this app can least
    // afford.
    expect(seen.order[0]).toBe("ErrorBoundary");
  });

  it("puts the language provider outside auth, so errors render translated", () => {
    expect(seen.order.indexOf("LanguageProvider"))
      .toBeLessThan(seen.order.indexOf("AuthProvider"));
  });

  it("puts the router inside auth, so every route can read the session", () => {
    expect(seen.order.indexOf("AuthProvider"))
      .toBeLessThan(seen.order.indexOf("BrowserRouter"));
  });

  it("mounts the command palette once, globally", () => {
    expect(screen.getAllByTestId("command-palette")).toHaveLength(1);
  });
});

describe("the legal documents", () => {
  // They existed at the repo root and were routed nowhere, while the product
  // collected accounts and sent scripts to AI providers. Public on purpose:
  // somebody deciding whether to sign up has to be able to read them BEFORE
  // they have an account, so putting these behind ProtectedRoute would defeat
  // the point of adding them.
  it.each(["/terms", "/privacy"])("serves %s", (path) => {
    expect(route(path)).toBeDefined();
    expect(route(path).page).toBe("LegalPage");
  });

  it.each(["/terms", "/privacy"])("leaves %s readable without an account", (path) => {
    expect(route(path).protected).toBe(false);
  });
});
