import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * A password input the writer can read back.
 *
 * Two details here are accessibility contracts rather than styling, and both are
 * the kind of thing a refactor drops without anything failing.
 *
 * `autoComplete` has to reach the input. Without `current-password` and
 * `new-password` a password manager cannot reliably fill on sign-in or offer to
 * save on sign-up, and the browser falls back to guessing from field order —
 * which on a split-screen auth page guesses wrong.
 *
 * The visibility toggle has to stay out of the tab order. A keyboard user
 * tabbing from the password field expects the submit button; landing on a Show
 * control instead means Enter reveals the password rather than signing in.
 */

// eslint-disable-next-line import/first
import PasswordField from "./PasswordField";

const renderField = (props = {}) => {
  const onChange = vi.fn();
  render(
    <PasswordField
      id="password" label="Password" value="" onChange={onChange}
      autoComplete="current-password" {...props}
    />
  );
  return onChange;
};

const input = () => screen.getByLabelText("Password");

it("hides the password to begin with", () => {
  renderField();

  expect(input()).toHaveAttribute("type", "password");
});

it("reveals it on request", () => {
  renderField();

  fireEvent.click(screen.getByRole("button", { name: "Show password" }));

  expect(input()).toHaveAttribute("type", "text");
});

it("hides it again", () => {
  renderField();

  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  fireEvent.click(screen.getByRole("button", { name: "Hide password" }));

  expect(input()).toHaveAttribute("type", "password");
});

it("keeps the toggle out of the tab order", () => {
  // Tabbing from the password field must reach submit, not this.
  renderField();

  expect(screen.getByRole("button", { name: "Show password" }))
    .toHaveAttribute("tabindex", "-1");
});

it("does not submit the form it sits in", () => {
  // A toggle without type="button" submits, which on a login form means
  // clicking Show attempts a sign-in.
  renderField();

  expect(screen.getByRole("button", { name: "Show password" }))
    .toHaveAttribute("type", "button");
});

it("ties the label to the input", () => {
  renderField();

  expect(input()).toHaveAttribute("id", "password");
});

it("passes autoComplete through, so a password manager can fill it", () => {
  renderField({ autoComplete: "new-password" });

  expect(input()).toHaveAttribute("autocomplete", "new-password");
});

it("reports what was typed", () => {
  const onChange = renderField();

  fireEvent.change(input(), { target: { value: "Kathmandu!2026" } });

  expect(onChange).toHaveBeenCalledWith("Kathmandu!2026");
});

it("is required, so the browser catches an empty submit", () => {
  renderField();

  expect(input()).toBeRequired();
});

it("carries a description for the strength rules", () => {
  renderField({ describedBy: "password-rules" });

  expect(input()).toHaveAttribute("aria-describedby", "password-rules");
});

it("renders whatever the caller puts under it", () => {
  renderField({ children: <p id="password-rules">At least 10 characters.</p> });

  expect(screen.getByText("At least 10 characters.")).toBeInTheDocument();
});
