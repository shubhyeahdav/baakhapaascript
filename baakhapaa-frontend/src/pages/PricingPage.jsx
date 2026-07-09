import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { subscription } from "../services/api";

const TIERS = [
  {
    key: "free",
    name: "Free",
    price: "Rs. 0",
    period: "forever",
    tagline: "For writers testing the waters",
    cta: "Start Writing",
    highlight: false,
    features: [
      "1 active project",
      "Three-act structure generator",
      "Script editor with auto-save",
      "PDF export",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "Rs. 999",
    period: "per month",
    tagline: "For serious storytellers",
    cta: "Go Pro",
    highlight: true,
    features: [
      "Unlimited projects",
      "Full AI scene generation & rewrites",
      "AI storyboard frames",
      "Word & production package exports",
      "Version history & restore",
    ],
  },
  {
    key: "studio",
    name: "Studio",
    price: "Rs. 2,499",
    period: "per month",
    tagline: "For production teams",
    cta: "Contact Us",
    highlight: false,
    features: [
      "Everything in Pro",
      "Real-time collaboration",
      "Comment threads & review notes",
      "Up to 10 team members",
      "Priority support",
    ],
  },
];

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold shrink-0">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export default function PricingPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [loadingTier, setLoadingTier] = useState(null);

  const handleCta = async (tier) => {
    // Free tier just sends the user into the app.
    if (tier === "free") {
      navigate(isAuthenticated ? "/dashboard" : "/register");
      return;
    }
    // Paid tiers require an account first, then a Stripe Checkout session.
    if (!isAuthenticated) {
      navigate("/register");
      return;
    }
    setLoadingTier(tier);
    try {
      const res = await subscription.checkout(tier);
      // Redirect to Stripe Checkout (or, in demo mode, the simulated success URL).
      window.location.href = res.data.url;
    } catch (err) {
      alert(err.response?.data?.detail || "Could not start checkout. Please try again.");
      setLoadingTier(null);
    }
  };

  return (
    <div className="min-h-screen cine-bg text-ink px-6 py-12">
      {/* Top bar */}
      <div className="max-w-5xl mx-auto flex justify-between items-center mb-14">
        <Link to="/" className="wordmark text-[15px]">BAAKHAPAA</Link>
        <Link
          to={isAuthenticated ? "/dashboard" : "/login"}
          className="text-sm text-inkMuted hover:text-ink transition"
        >
          {isAuthenticated ? "Back to Dashboard" : "Sign In"}
        </Link>
      </div>

      {/* Heading */}
      <div className="text-center mb-12 animate-fade-up">
        <p className="text-inkMuted text-xs tracking-[0.24em] uppercase mb-4">Pricing</p>
        <h1 className="font-display text-4xl md:text-5xl mb-4">
          Every story deserves{" "}
          <span className="text-transparent bg-clip-text bg-gold-sheen">a fair start.</span>
        </h1>
        <p className="text-inkSoft text-[15px] max-w-xl mx-auto">
          Start free. Upgrade when your production does.
        </p>
      </div>

      {/* Tiers */}
      <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-5 animate-fade-up">
        {TIERS.map((tier) => (
          <div
            key={tier.key}
            className={`relative rounded-2xl p-7 flex flex-col border ${
              tier.highlight
                ? "bg-elevated border-gold/50 shadow-glow"
                : "bg-surface border-borderSoft"
            }`}
          >
            {tier.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider bg-gold-sheen text-white px-3 py-1 rounded-full">
                Most Popular
              </span>
            )}

            <h2 className="font-display text-xl mb-1">{tier.name}</h2>
            <p className="text-inkMuted text-xs mb-5">{tier.tagline}</p>

            <div className="mb-6">
              <span className="font-display text-4xl">{tier.price}</span>
              <span className="text-inkMuted text-sm ml-2">{tier.period}</span>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-inkSoft">
                  <span className="mt-0.5"><Check /></span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleCta(tier.key)}
              disabled={loadingTier === tier.key}
              className={tier.highlight ? "btn-gold w-full" : "btn-ghost w-full"}
            >
              {loadingTier === tier.key ? "Redirecting…" : tier.cta}
            </button>
          </div>
        ))}
      </div>

      <p className="text-center text-inkMuted text-xs mt-10">
        Prices in Nepali Rupees. Secure checkout via Stripe. Running in test mode
        until live payment keys are configured.
      </p>
    </div>
  );
}
