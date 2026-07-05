import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await register(form.email, form.password, form.name);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
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

          <h2 className="font-display text-3xl text-ink mb-1">Create Account</h2>
          <p className="text-inkMuted text-sm mb-8">Start your screenwriting journey today</p>

          {error && (
            <div className="mb-5 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">Full Name</label>
              <input
                placeholder="Mira Rai"
                className="field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="field-label">Email</label>
              <input
                type="email"
                placeholder="you@studio.com"
                className="field"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="field-label">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="field"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="field-label">Confirm Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="field"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-gold w-full mt-2">
              {loading ? "Creating Account…" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-inkMuted text-sm mt-8">
            Already have an account?{" "}
            <Link to="/login" className="text-gold hover:text-goldBright transition">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
