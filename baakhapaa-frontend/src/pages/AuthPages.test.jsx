import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * The sign-in and sign-up pages against the requirements they exist to meet:
 * authentication that works, and an interface a writer with no technical
 * background can complete without help (NFR03, NFR06).
 */

let mockLogin, mockRegister, mockGoogle, mockNavigate;

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
}));

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin, register: mockRegister, loginWithGoogle: mockGoogle }),
}));

// GoogleSignInButton asks the server which sign-in methods exist. Without this
// jsdom attempts a real request and the suite fills with CORS noise.
jest.mock("../services/api", () => ({
  auth: { providers: jest.fn() },
}));

// eslint-disable-next-line import/first
import { auth } from "../services/api";
// eslint-disable-next-line import/first
import LoginPage from "./LoginPage";
// eslint-disable-next-line import/first
import RegisterPage from "./RegisterPage";

beforeEach(() => {
  mockLogin = jest.fn().mockResolvedValue({});
  mockRegister = jest.fn().mockResolvedValue({});
  mockGoogle = jest.fn().mockResolvedValue({});
  mockNavigate = jest.fn();
  // Default: this deployment has no Google client id, which is the demo-mode
  // state the whole product runs in by default.
  auth.providers.mockResolvedValue({ data: { password: true, google: false } });
});

const STRONG = "Kathmandu2026!";

// ---------------------------------------------------------------------------
// The address has to reach the account
// ---------------------------------------------------------------------------
test("sign-in sends the address normalised, whatever the keyboard did to it", async () => {
  // Phone keyboards capitalise the first letter by default, and the account
  // lookup is an exact string match.
  render(<LoginPage />);

  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: "  Mira@Studio.COM  " },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: STRONG } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

  await waitFor(() =>
    expect(mockLogin).toHaveBeenCalledWith("mira@studio.com", STRONG)
  );
});

test("sign-up creates the account under the same normalised address", async () => {
  render(<RegisterPage />);

  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "  Mira Rai " } });
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "Mira@Studio.COM" } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: STRONG } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: STRONG } });
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));

  await waitFor(() =>
    expect(mockRegister).toHaveBeenCalledWith("mira@studio.com", STRONG, "Mira Rai")
  );
});

// ---------------------------------------------------------------------------
// Fields a person and a password manager can both use
// ---------------------------------------------------------------------------
test("every field is reachable by its label", () => {
  // Without htmlFor/id the label is decoration: clicking it does not focus the
  // field, and a screen reader announces an unnamed input.
  render(<RegisterPage />);
  for (const label of [/full name/i, /email/i, /^password$/i, /confirm password/i]) {
    expect(screen.getByLabelText(label)).toBeInTheDocument();
  }
});

test("password fields carry the autocomplete tokens a password manager needs", () => {
  const { unmount } = render(<LoginPage />);
  expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("autocomplete", "current-password");
  expect(screen.getByLabelText(/email/i)).toHaveAttribute("autocomplete", "username");
  unmount();

  render(<RegisterPage />);
  expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("autocomplete", "new-password");
});

test("the email field does not let a phone keyboard rewrite the address", () => {
  render(<LoginPage />);
  const email = screen.getByLabelText(/email/i);
  expect(email).toHaveAttribute("autocapitalize", "none");
  expect(email).toHaveAttribute("autocorrect", "off");
});

test("a password can be revealed, because a typo you cannot see is unfixable", () => {
  render(<LoginPage />);
  const field = screen.getByLabelText(/^password$/i);
  expect(field).toHaveAttribute("type", "password");

  fireEvent.click(screen.getByRole("button", { name: /show password/i }));
  expect(field).toHaveAttribute("type", "text");
});

// ---------------------------------------------------------------------------
// Telling the user what is wrong
// ---------------------------------------------------------------------------
test("a failed sign-in is announced, not just coloured", async () => {
  mockLogin.mockRejectedValue({ response: { status: 401, data: { detail: "Invalid email or password" } } });
  render(<LoginPage />);

  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.co" } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "x" } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Invalid email or password");
});

test("a rate-limited sign-in says to wait rather than blaming the password", async () => {
  mockLogin.mockRejectedValue({ response: { status: 429, data: { error: "Rate limit exceeded" } } });
  render(<LoginPage />);

  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.co" } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "x" } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
});

test("the password rules are readable before anything is typed", () => {
  // They used to appear only once typing began, so a new user picked a
  // password and was told afterwards that it was wrong. Now stated as one
  // sentence rather than a five-row checklist taller than the form.
  render(<RegisterPage />);
  const stated = screen.getByText(/use at least 8 characters/i);
  expect(stated).toHaveTextContent(/uppercase/i);
  expect(stated).toHaveTextContent(/symbol/i);
});

test("a partly-valid password names only what is still missing", () => {
  render(<RegisterPage />);
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "kathmandu1" } });

  const status = screen.getByText(/still needs/i);
  expect(status).toHaveTextContent(/an uppercase letter/i);
  expect(status).toHaveTextContent(/a symbol/i);
  // The rules it already satisfies are not restated.
  expect(status).not.toHaveTextContent(/a number/i);
});

test("a password that meets every rule says so in one line", () => {
  render(<RegisterPage />);
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: STRONG } });

  expect(screen.getByText(/strong enough/i)).toBeInTheDocument();
  expect(screen.queryByText(/still needs/i)).not.toBeInTheDocument();
});

test("the sign-up button is never a dead control", () => {
  // It was disabled until every rule passed, which left a new user with a
  // button that did nothing and no statement of why.
  render(<RegisterPage />);
  expect(screen.getByRole("button", { name: /create account/i })).toBeEnabled();
});

test("submitting an incomplete sign-up explains what is missing", async () => {
  render(<RegisterPage />);

  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Mira" } });
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.co" } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "weak" } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "weak" } });
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/requirements/i);
  expect(mockRegister).not.toHaveBeenCalled();
});

test("mismatched passwords are caught before the request", async () => {
  render(<RegisterPage />);

  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Mira" } });
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.co" } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: STRONG } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: `${STRONG}x` } });
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
  expect(mockRegister).not.toHaveBeenCalled();
});


// ---------------------------------------------------------------------------
// Google sign-in
// ---------------------------------------------------------------------------
test("no Google button when the deployment has no client id", async () => {
  // A button that fails on click reads as the product being broken rather than
  // as a feature this deployment has not configured.
  render(<LoginPage />);
  await waitFor(() => expect(auth.providers).toHaveBeenCalled());
  expect(document.querySelector('script[src*="accounts.google.com"]')).toBeNull();
});

test("the sign-in form still works with Google unavailable", async () => {
  render(<LoginPage />);

  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.co" } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: STRONG } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

  await waitFor(() => expect(mockLogin).toHaveBeenCalled());
});

test("a configured deployment loads Google's script", async () => {
  auth.providers.mockResolvedValue({
    data: { password: true, google: true, google_client_id: "abc.apps.googleusercontent.com" },
  });
  render(<LoginPage />);

  await waitFor(() =>
    expect(document.querySelector('script[src*="accounts.google.com"]')).not.toBeNull()
  );
});
