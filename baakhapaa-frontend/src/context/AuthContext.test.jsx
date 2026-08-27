import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";

/**
 * Who is signed in, and how the app finds out.
 *
 * The behaviour that matters most here is the one nobody sees: on mount, with a
 * token in localStorage, the provider has to stay in its loading state until
 * `getMe` answers. `ProtectedRoute` reads `isLoading`, and if this provider
 * settled to "not authenticated" first, every hard refresh would bounce a signed
 * in writer to the login page before the token had even been checked.
 *
 * The second is the stale token. A token that no longer verifies has to be
 * cleared, or the app retries it on every load forever and the writer is stuck
 * in a loop they can only escape by clearing site data.
 *
 * Note `refreshUser` reads `res.data` directly while `login` reads
 * `res.data.user` — the two endpoints genuinely return different shapes, and a
 * test that used one fixture for both would hide it.
 */

vi.mock("../services/api", () => ({
  auth: { login: vi.fn(), register: vi.fn(), getMe: vi.fn(), google: vi.fn() },
}));

// eslint-disable-next-line import/first
import { AuthProvider, useAuth } from "./AuthContext";
// eslint-disable-next-line import/first
import { auth } from "../services/api";

const USER = { id: "u1", name: "Mira", email: "mira@example.com", subscription_tier: "pro" };

let ctx;
function Probe() {
  ctx = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(ctx.isLoading)}</span>
      <span data-testid="authed">{String(ctx.isAuthenticated)}</span>
      <span data-testid="name">{ctx.user?.name || "-"}</span>
    </div>
  );
}

const show = () => render(<AuthProvider><Probe /></AuthProvider>);

beforeEach(() => {
  ctx = undefined;
  localStorage.clear();
  auth.getMe.mockResolvedValue({ data: USER });
  auth.login.mockResolvedValue({ data: { token: "tok", user: USER } });
  auth.register.mockResolvedValue({});
  auth.google.mockResolvedValue({ data: { token: "gtok", user: USER } });
});

describe("on mount", () => {
  it("settles immediately when there is no token, without asking the server", async () => {
    show();

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(auth.getMe).not.toHaveBeenCalled();
    expect(screen.getByTestId("authed")).toHaveTextContent("false");
  });

  it("stays loading while a stored token is being checked", () => {
    // The behaviour that stops a hard refresh bouncing a signed-in writer to
    // the login page: ProtectedRoute waits on exactly this flag.
    localStorage.setItem("token", "tok");
    auth.getMe.mockReturnValue(new Promise(() => {}));
    show();

    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(screen.getByTestId("authed")).toHaveTextContent("false");
  });

  it("restores the session from a good token", async () => {
    localStorage.setItem("token", "tok");
    show();

    await waitFor(() => expect(screen.getByTestId("authed")).toHaveTextContent("true"));
    expect(screen.getByTestId("name")).toHaveTextContent("Mira");
  });

  it("throws away a token the server will not accept", async () => {
    // Otherwise the app retries it on every load and the writer is stuck in a
    // loop only clearing site data escapes.
    localStorage.setItem("token", "stale");
    auth.getMe.mockRejectedValue({ response: { status: 401 } });
    show();

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(localStorage.getItem("token")).toBeNull();
    expect(screen.getByTestId("authed")).toHaveTextContent("false");
  });

  it("stops loading even when the check fails", async () => {
    localStorage.setItem("token", "stale");
    auth.getMe.mockRejectedValue(new Error("offline"));
    show();

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
  });
});

describe("login", () => {
  it("stores the token and the user", async () => {
    show();
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    await act(async () => { await ctx.login("mira@example.com", "pw"); });

    expect(localStorage.getItem("token")).toBe("tok");
    expect(screen.getByTestId("authed")).toHaveTextContent("true");
    expect(screen.getByTestId("name")).toHaveTextContent("Mira");
  });

  it("hands the user back to the caller, so a form can route on it", async () => {
    show();
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    let returned;
    await act(async () => { returned = await ctx.login("mira@example.com", "pw"); });

    expect(returned).toEqual(USER);
  });

  it("lets a rejection reach the form, which is what shows the message", async () => {
    auth.login.mockRejectedValue({ response: { data: { detail: "Invalid credentials" } } });
    show();
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    await expect(ctx.login("mira@example.com", "wrong")).rejects.toBeTruthy();
    expect(localStorage.getItem("token")).toBeNull();
  });
});

describe("register", () => {
  it("signs the new account straight in", async () => {
    // Making somebody log in immediately after choosing a password is a step
    // with no purpose, and one more place to mistype it.
    show();
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    await act(async () => { await ctx.register("new@example.com", "pw", "New"); });

    expect(auth.register).toHaveBeenCalledWith("new@example.com", "pw", "New");
    expect(auth.login).toHaveBeenCalledWith("new@example.com", "pw");
    expect(screen.getByTestId("authed")).toHaveTextContent("true");
  });

  it("does not attempt a login when registration was refused", async () => {
    auth.register.mockRejectedValue({ response: { data: { detail: "Email already registered" } } });
    show();
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    await expect(ctx.register("taken@example.com", "pw", "X")).rejects.toBeTruthy();
    expect(auth.login).not.toHaveBeenCalled();
  });
});

describe("loginWithGoogle", () => {
  it("takes the same route as a password login", async () => {
    // One call for both sign-up and sign-in: from the writer's side there is
    // no difference, and the server decides which it was.
    show();
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    await act(async () => { await ctx.loginWithGoogle("id-token"); });

    expect(auth.google).toHaveBeenCalledWith("id-token");
    expect(localStorage.getItem("token")).toBe("gtok");
    expect(screen.getByTestId("authed")).toHaveTextContent("true");
  });
});

describe("logout", () => {
  it("clears the token and the user", async () => {
    localStorage.setItem("token", "tok");
    show();
    await waitFor(() => expect(screen.getByTestId("authed")).toHaveTextContent("true"));

    act(() => { ctx.logout(); });

    expect(localStorage.getItem("token")).toBeNull();
    expect(screen.getByTestId("authed")).toHaveTextContent("false");
  });
});

describe("refreshUser", () => {
  it("re-reads the user, so a tier change lands without a reload", async () => {
    // What PaymentReturn calls after a successful payment: the tier changed
    // server-side and the cached user object has not.
    localStorage.setItem("token", "tok");
    show();
    await waitFor(() => expect(screen.getByTestId("authed")).toHaveTextContent("true"));
    auth.getMe.mockResolvedValue({ data: { ...USER, name: "Mira S", subscription_tier: "studio" } });

    await act(async () => { await ctx.refreshUser(); });

    expect(screen.getByTestId("name")).toHaveTextContent("Mira S");
    expect(ctx.user.subscription_tier).toBe("studio");
  });

  it("reads the whole body, not a nested user key", async () => {
    // `getMe` returns the user directly while `login` wraps it in `.user`.
    // Using one shape for both would leave `user` undefined here.
    localStorage.setItem("token", "tok");
    show();
    await waitFor(() => expect(screen.getByTestId("authed")).toHaveTextContent("true"));

    let returned;
    await act(async () => { returned = await ctx.refreshUser(); });

    expect(returned).toEqual(USER);
  });
});

it("offers a stable shape to every consumer", async () => {
  show();
  await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

  for (const key of ["user", "isLoading", "isAuthenticated", "login", "register",
                     "loginWithGoogle", "logout", "refreshUser"]) {
    expect(ctx).toHaveProperty(key);
  }
});
