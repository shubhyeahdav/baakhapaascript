import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Sign in with Google — and, far more often in this build, do not.
 *
 * `GOOGLE_CLIENT_ID` is per-deployment and this build runs in demo mode with no
 * keys of any kind, so the *invisible* path is the normal one. That is the
 * behaviour worth protecting: a Google button that fails on click reads as the
 * product being broken rather than as a feature this deployment has not
 * configured. The component therefore asks the server first and renders nothing
 * unless the answer is yes.
 *
 * Both halves of that answer are required. `google: true` with no id would
 * initialise Google's widget with `client_id: undefined`, which fails inside
 * Google's own script where this component cannot catch it or report it.
 *
 * The script is loaded on demand rather than from index.html, so a deployment
 * without a client id never contacts Google at all and the sign-in page carries
 * no third-party request on its critical path. The test that no script tag is
 * appended is what keeps that true.
 */

vi.mock("../services/api", () => ({
  auth: { providers: vi.fn() },
}));

// eslint-disable-next-line import/first
import GoogleSignInButton from "./GoogleSignInButton";
// eslint-disable-next-line import/first
import { auth } from "../services/api";

const onSuccess = vi.fn();
const onError = vi.fn();

const gsi = () => document.querySelectorAll('script[src*="accounts.google.com"]');

beforeEach(() => {
  document.head.querySelectorAll('script[src*="accounts.google.com"]')
    .forEach((s) => s.remove());
  delete window.google;
  auth.providers.mockResolvedValue({ data: { google: false } });
  onSuccess.mockResolvedValue(undefined);
});

const show = () =>
  render(<GoogleSignInButton onSuccess={onSuccess} onError={onError} />);

describe("when the deployment has no Google client id", () => {
  it("renders nothing", async () => {
    const { container } = show();

    await waitFor(() => expect(auth.providers).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("never contacts Google", async () => {
    show();

    await waitFor(() => expect(auth.providers).toHaveBeenCalled());
    expect(gsi()).toHaveLength(0);
  });

  it("stays hidden when the server claims google but sends no id", async () => {
    // The half-configured case. Rendering here would hand Google's script
    // `client_id: undefined` and fail somewhere this component cannot see.
    auth.providers.mockResolvedValue({ data: { google: true } });
    const { container } = show();

    await waitFor(() => expect(auth.providers).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(gsi()).toHaveLength(0);
  });

  it("stays hidden when the id is an empty string", async () => {
    auth.providers.mockResolvedValue({ data: { google: true, google_client_id: "" } });
    const { container } = show();

    await waitFor(() => expect(auth.providers).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("stays quiet when the server cannot be reached", async () => {
    // The form's own submit path already reports an unreachable server; a
    // second error about a button nobody asked for is noise.
    auth.providers.mockRejectedValue(new Error("offline"));
    const { container } = show();

    await waitFor(() => expect(auth.providers).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("when Google is configured", () => {
  const initialize = vi.fn();
  const renderButton = vi.fn();

  beforeEach(() => {
    auth.providers.mockResolvedValue({
      data: { google: true, google_client_id: "123.apps.googleusercontent.com" },
    });
    initialize.mockClear();
    renderButton.mockClear();
    // Pretend Google's script is already present, so `loadGoogleScript`
    // resolves without a network request.
    window.google = { accounts: { id: { initialize, renderButton } } };
  });

  it("renders the holder and the divider", async () => {
    show();

    expect(await screen.findByText("or")).toBeInTheDocument();
  });

  it("initialises Google with the id the server gave it", async () => {
    show();

    await waitFor(() => expect(initialize).toHaveBeenCalled());
    expect(initialize.mock.calls[0][0].client_id)
      .toBe("123.apps.googleusercontent.com");
  });

  it("asks Google to draw its own button", async () => {
    show();

    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(renderButton.mock.calls[0][1]).toMatchObject({ text: "signin_with" });
  });

  it("uses the caller's wording, since one component serves sign-in and sign-up", async () => {
    render(<GoogleSignInButton onSuccess={onSuccess} onError={onError} text="signup_with" />);

    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(renderButton.mock.calls[0][1].text).toBe("signup_with");
  });

  it("hands the credential to the caller", async () => {
    show();
    await waitFor(() => expect(initialize).toHaveBeenCalled());

    await initialize.mock.calls[0][0].callback({ credential: "id-token" });

    expect(onSuccess).toHaveBeenCalledWith("id-token");
  });

  it("reports a rejected credential in the page's own words", async () => {
    onSuccess.mockRejectedValue({
      response: { data: { detail: "That email is registered with a password." } },
    });
    show();
    await waitFor(() => expect(initialize).toHaveBeenCalled());

    await initialize.mock.calls[0][0].callback({ credential: "id-token" });

    expect(onError).toHaveBeenCalledWith("That email is registered with a password.");
  });

  it("points a blocked script back at the form that still works", async () => {
    // An extension, an offline machine, or a network policy. The email and
    // password form is right there.
    delete window.google;
    show();

    await waitFor(() => expect(gsi().length).toBe(1));
    gsi()[0].dispatchEvent(new Event("error"));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(
      "Google sign-in could not load. Use your email and password."));
  });
});
