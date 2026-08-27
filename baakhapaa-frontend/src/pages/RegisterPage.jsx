import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { checkPassword, passwordRequirementSentence } from "../utils/password";
import { authErrorMessage } from "../utils/apiError";
import PasswordField from "../components/PasswordField";
import { useT } from "../i18n";
import LanguageToggle from "../components/LanguageToggle";
import GoogleSignInButton from "../components/GoogleSignInButton";

/**
 * Password requirements, in two lines instead of six.
 *
 * This was a permanent five-row checklist. Every row was legible and the block
 * as a whole was taller than the field it described, pushing Confirm Password
 * and the submit button down the page — on a phone it pushed them off it. A
 * checklist is also the wrong shape for the job: four of the five rows are
 * satisfied by almost any password on the first try, so it spends most of its
 * height reporting success nobody asked about.
 *
 * So: a strength bar for progress at a glance, and one line of text that says
 * only the thing that still needs doing. Before typing, that line states the
 * whole requirement, which is what keeps the rules knowable up front rather
 * than revealed by rejection.
 */
function PasswordStrength({ pw, typed }) {
  const tone =
    pw.met <= 2 ? "bg-red-400" : pw.met <= 4 ? "bg-amber-400" : "bg-emerald-400";

  return (
    <div className="mt-2">
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: pw.total }).map((_, i) => (
          <span
            key={i}
            className={`h-[3px] flex-1 rounded-full transition-colors duration-300 ${
              typed && i < pw.met ? tone : "bg-borderSoft"
            }`}
          />
        ))}
      </div>
      {/* Announced politely: a screen-reader user gets the same running
          feedback a sighted user reads off the bar. */}
      <p
        id="password-rules"
        aria-live="polite"
        className={`mt-1.5 text-xs leading-snug ${
          !typed ? "text-inkMuted" : pw.valid ? "text-emerald-400" : "text-inkSoft"
        }`}
      >
        {!typed
          ? passwordRequirementSentence()
          : pw.valid
            ? "Strong enough."
            : `Still needs ${pw.missing.join(", ")}.`}
      </p>
    </div>
  );
}


export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const t = useT();

  const pw = checkPassword(form.password);
  const confirmTouched = form.confirm.length > 0;
  const passwordsMatch = form.password === form.confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!pw.valid) {
      setError("Your password doesn't meet all the requirements below.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      // Normalised here too, so the address the account is created under is
      // the same one the login form will send.
      await register(form.email.trim().toLowerCase(), form.password, form.name.trim());
      navigate("/dashboard");
    } catch (err) {
      setError(authErrorMessage(err, "Registration failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (credential) => {
    setError("");
    await loginWithGoogle(credential);
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex bg-bg text-ink">
      {/* Cinematic brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[52%] cine-bg relative overflow-hidden p-14 border-r border-borderSoft">
        {/* Letterbox hairlines */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

        <div className="flex items-center gap-3 relative z-10">
          <span className="wordmark text-lg">BAAKHAPAA</span>
        </div>

        <div className="relative z-10 max-w-lg animate-fade-up">
          <p className="text-inkMuted text-xs tracking-[0.24em] uppercase mb-6">
            Pre-Production Studio
          </p>
          <h1 className="font-display text-5xl leading-[1.08] text-ink mb-6">
            Bring your script
            <span className="block text-transparent bg-clip-text bg-gold-sheen">
              to life.
            </span>
          </h1>
          <p className="text-inkSoft text-[15px] leading-relaxed">
            Join the studio built for modern screenwriters and pre-production teams. Complete scene structure generation, storyboard planning, and collaborative feedback—all in one workspace.
          </p>
        </div>

        <div className="relative z-10 flex gap-8 text-inkMuted text-xs">
          <div>
            <div className="text-ink text-sm mb-0.5">Free Sign Up</div>
            <span>No credit card required</span>
          </div>
          <div>
            <div className="text-ink text-sm mb-0.5">Cloud Synced</div>
            <span>Always auto-saved</span>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="lg:hidden text-center mb-10">
            <span className="wordmark text-base">BAAKHAPAA</span>
          </div>

          <h2 className="font-display text-3xl text-ink mb-1">{t("Create Account")}</h2>
          <p className="text-inkMuted text-sm mb-8">Start your screenwriting journey today</p>

          {/* Same reasoning as the login page: choosing the interface language
              must not require already having an account. */}
          <LanguageToggle variant="inline" className="mb-6 -mt-4" />

          {error && (
            <div
              role="alert"
              className="mb-5 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3"
            >
              {error}
            </div>
          )}

          <GoogleSignInButton
            onSuccess={handleGoogle}
            onError={setError}
            text="signup_with"
          />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="name">
                {t("Full Name")}
              </label>
              <input
                id="name"
                name="name"
                placeholder="Mira Rai"
                className="field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoComplete="name"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="email">
                {t("Email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@studio.com"
                className="field"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                inputMode="email"
                required
              />
            </div>

            <PasswordField
              id="new-password"
              label={t("Password")}
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
              placeholder="Create a strong password"
              autoComplete="new-password"
              describedBy="password-rules"
            >
              <PasswordStrength pw={pw} typed={form.password.length > 0} />
            </PasswordField>

            <PasswordField
              id="confirm-password"
              label={t("Confirm Password")}
              value={form.confirm}
              onChange={(v) => setForm({ ...form, confirm: v })}
              placeholder={t("Confirm Password")}
              autoComplete="new-password"
              describedBy="confirm-status"
            >
              {confirmTouched && (
                <p
                  id="confirm-status"
                  className={`mt-1.5 text-xs ${passwordsMatch ? "text-emerald-400" : "text-red-400"}`}
                >
                  {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                </p>
              )}
            </PasswordField>

            {/* Consent, and consent that can actually be given: both documents
                are one click away and open in a new tab, so reading them does
                not throw away a half-filled form.

                Stated rather than checkboxed. A checkbox is the more familiar
                pattern and it is the weaker one here — it trains people to tick
                without reading, and Nepal's Individual Privacy Act 2075 asks
                for informed consent, not a ticked box. Creating the account IS
                the affirmative act, and this sentence is what makes it
                informed. The specific sentence about script text is here
                because it is the thing a screenwriter would actually want to
                know and the thing a generic policy link buries. */}
            <p className="text-[11.5px] text-inkMuted leading-snug mt-4">
              {t("By creating an account you agree to our")}{" "}
              <Link to="/terms" target="_blank" rel="noopener noreferrer"
                    className="text-gold hover:underline">
                {t("Terms of Use")}
              </Link>{" "}
              {t("and")}{" "}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer"
                    className="text-gold hover:underline">
                {t("Privacy Policy")}
              </Link>
              . {t("Your script text is stored without application-level encryption and is sent to our AI providers when you ask for generation.")}
            </p>

            {/* Deliberately NOT disabled while the form is incomplete. A dead
                button gives a user nothing to act on and no way to find out
                what is missing; submitting and being told is the version that
                can be recovered from. It is disabled only while a request is
                actually in flight, which is what stops a double sign-up. */}
            <button type="submit" disabled={loading} className="btn-gold w-full mt-2">
              {loading ? "…" : t("Create Account")}
            </button>
          </form>

          <p className="text-center text-inkMuted text-sm mt-8">
            {t("Already have an account?")}{" "}
            <Link to="/login" className="text-gold hover:text-goldBright transition">
              {t("Sign In")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
