import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authErrorMessage } from "../utils/apiError";
import PasswordField from "../components/PasswordField";
import GoogleSignInButton from "../components/GoogleSignInButton";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Sent normalised so what reaches the API is what the account is stored
      // under, whatever a phone keyboard capitalised on the way in.
      await login(email.trim().toLowerCase(), password);
      navigate("/dashboard");
    } catch (err) {
      setError(authErrorMessage(err, "Login failed. Please try again."));
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
            Where a story becomes
            <span className="block text-transparent bg-clip-text bg-gold-sheen">
              a production.
            </span>
          </h1>
          <p className="text-inkSoft text-[15px] leading-relaxed">
            Script structure, scene writing, and storyboards — crafted for
            Nepali storytelling and built for the way filmmakers actually work.
          </p>
        </div>

        <div className="relative z-10 flex gap-8 text-inkMuted text-xs">
          <div>
            <div className="text-ink text-sm mb-0.5">Three-act intelligence</div>
            <span>Structure in seconds</span>
          </div>
          <div>
            <div className="text-ink text-sm mb-0.5">Auto storyboards</div>
            <span>Shot-listed frames</span>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="lg:hidden text-center mb-10">
            <span className="wordmark text-base">BAAKHAPAA</span>
          </div>

          <h2 className="font-display text-3xl text-ink mb-1">Welcome back</h2>
          <p className="text-inkMuted text-sm mb-8">Sign in to your studio</p>

          {/* role="alert" so a screen reader announces the failure. Without it
              the only signal that sign-in failed was a colour change. */}
          {error && (
            <div
              role="alert"
              className="mb-5 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3"
            >
              {error}
            </div>
          )}

          <GoogleSignInButton
            onSuccess={handleGoogle}
            onError={setError}
            text="signin_with"
          />

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              {/* htmlFor/id: without the pair, the label is decoration —
                  clicking it does not focus the field and a screen reader
                  reaches an unnamed input. */}
              <label className="field-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@studio.com"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                // `username` is the token password managers actually look for
                // when pairing an address with a saved credential.
                autoComplete="username"
                // Phone keyboards capitalise and autocorrect by default, which
                // is how an address gets typed differently from how it was
                // registered.
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                inputMode="email"
                autoFocus
                required
              />
            </div>

            <PasswordField
              id="current-password"
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="Your password"
              autoComplete="current-password"
            />

            <button type="submit" disabled={loading} className="btn-gold w-full">
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="text-center text-inkMuted text-sm mt-8">
            No account?{" "}
            <Link to="/register" className="text-gold hover:text-goldBright transition">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
