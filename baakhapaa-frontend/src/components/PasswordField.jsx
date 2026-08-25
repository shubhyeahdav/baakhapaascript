import React, { useState } from "react";

/**
 * A password input the user can read back.
 *
 * Typing a password you cannot see is a guess, and this product's stated
 * audience is writers with no technical background, on phones, entering a
 * password the policy requires to contain a symbol and a digit. Hiding it by
 * default and offering to show it is the standard resolution, and it removes
 * the most common cause of "my password is wrong" — a typo nobody could see.
 *
 * `autoComplete` is required rather than optional: without `current-password`
 * and `new-password`, a password manager cannot reliably fill on sign-in or
 * offer to save on sign-up, and the browser falls back to guessing from field
 * order.
 */
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  describedBy,
  children,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          className="field pr-16"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-describedby={describedBy}
          required
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // Outside the tab order: a keyboard user tabbing from password to
          // submit should reach submit, not a visibility toggle.
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] uppercase tracking-wider text-inkMuted hover:text-gold transition-colors"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {children}
    </div>
  );
}
