import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { subscription } from "../services/api";

const TIERS = [
  {
    key: "free",
    name: "Free",
    price: "Rs. 0",
    period: "forever",
    tagline: "Everything you need to write and finish one script",
    cta: "Start Writing",
    highlight: false,
    // These are what the free tier ACTUALLY gets, checked against the code
    // rather than against an old plan: nothing here is behind `require_tier`
    // or `require_paid_tier`. The previous list named five things and omitted
    // the course, the linter, the benchmark and Final Draft export — it sold
    // the free tier as a trial when it is a usable product, which costs
    // signups at the top of the funnel.
    features: [
      "3 active projects",
      "The full course — both tracks, 19 lessons, graded",
      "Craft linter: line-by-line notes as you write",
      "Benchmark your draft's shape against the corpus",
      "Structure starter, scene index, corkboard and outline",
      "Version history, diffs and comments",
      "Export to PDF and Final Draft (.fdx)",
      "Share a project with up to 2 collaborators",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "Rs. 999",
    period: "per month",
    tagline: "For writers who want the AI doing the heavy lifting",
    cta: "Go Pro",
    highlight: true,
    // The real paid line: everything that costs an API call, plus the project
    // cap and the two heavier exports. "Version history & restore" was listed
    // here and is free — claiming a free feature as paid makes the whole list
    // untrustworthy.
    features: [
      "Everything in Free, with unlimited projects",
      "Up to 5 collaborators per project",
      "AI scene generation, rewrites and suggestions",
      "AI storyboard frames from your scenes",
      "Word and production-package exports",
      "Structure generation grounded in the craft corpus",
    ],
  },
  {
    key: "studio",
    name: "Studio",
    price: "Rs. 2,499",
    period: "per month",
    tagline: "For production teams",
    cta: "Go Studio",
    highlight: false,
    // Studio now buys something. It previously did not: `PAID_TIERS` held both
    // paid tiers and nothing branched on studio, so it cost Rs 1,500/month more
    // than Pro for nothing — while promising real-time collaboration that had
    // been descoped and a ten-seat cap no code enforced.
    //
    // `membership.SEAT_LIMITS` is the differentiator, and it is enforced
    // server-side against the project OWNER's plan. Every line below is a thing
    // the build actually does.
    features: [
      "Everything in Pro",
      "Unlimited collaborators per project",
      "Roles per project — who can write, who can only read",
      "Line-anchored comments, attributed to whoever left them",
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

// "Sandbox" and "simulated" are genuinely different things and the difference
// is worth showing: a sandbox payment goes to the real gateway, on its real test
// host, and proves the integration works. A simulated one never leaves our own
// server. Calling both "test mode" is how an unexercised integration looks fine
// right up until launch day.
const MODE_NOTE = {
  sandbox: "Sandbox — real gateway, no real money",
  demo: "Simulated — no gateway contacted",
};
// A provider in demo also sends a `hint` saying what it would take to reach the
// real gateway. Without it, "simulated" reads as broken rather than unconfigured.

/**
 * eSewa has no API that creates a checkout session. It takes a signed browser
 * form POST, and the signature covers the form values — so the browser has to
 * be the thing that submits them. Building and submitting a hidden form is the
 * documented integration, not a workaround.
 */
function submitEsewaForm({ action, fields }) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

export default function PricingPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [loadingTier, setLoadingTier] = useState(null);
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState(null);

  // Which gateways this deployment can actually take money through. Asked of
  // the server rather than hardcoded, because the answer differs between the
  // demo build, a Nepal deploy and one selling abroad.
  useEffect(() => {
    subscription
      .providers()
      .then((res) => {
        setProviders(res.data.providers || []);
        setProvider(res.data.default);
      })
      .catch(() => {
        // A pricing page that can't reach the API should still read as a
        // pricing page. Checkout will report the real error when clicked.
        setProviders([]);
      });
  }, []);

  const handleCta = async (tier) => {
    // Free tier just sends the user into the app.
    if (tier === "free") {
      navigate(isAuthenticated ? "/dashboard" : "/register");
      return;
    }
    // Paid tiers require an account first, then a gateway session.
    if (!isAuthenticated) {
      navigate("/register");
      return;
    }
    setLoadingTier(tier);
    try {
      const res = await subscription.checkout(tier, provider);
      if (res.data.kind === "form_post") {
        submitEsewaForm(res.data);
        return; // the browser is navigating away
      }
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

      {/* Payment method. Shown only when there is a choice to make — one
          configured gateway is not a decision worth asking a writer for. */}
      {isAuthenticated && providers.length > 1 && (
        <div className="max-w-5xl mx-auto mb-10 animate-fade-up">
          <p className="text-inkMuted text-xs tracking-[0.18em] uppercase mb-3 text-center">
            Pay with
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {providers.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setProvider(p.key)}
                aria-pressed={provider === p.key}
                title={p.description}
                className={`px-4 py-2.5 rounded-xl border text-sm text-left transition ${
                  provider === p.key
                    ? "bg-elevated border-gold/50 text-ink"
                    : "bg-surface border-borderSoft text-inkMuted hover:text-ink"
                }`}
              >
                <span className="block">{p.name}</span>
                <span className="block text-[11px] text-inkMuted mt-0.5">
                  {p.hint || MODE_NOTE[p.mode] || p.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

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

      <p className="text-center text-inkMuted text-xs mt-10 max-w-lg mx-auto">
        Prices in Nepali Rupees, billed one month at a time — Khalti and eSewa
        take a single payment rather than a standing subscription, so nothing
        renews on its own and nothing is charged without you returning here.
        {providers.length > 0 && providers.every((p) => p.mode !== "live") &&
          " No live payment keys are configured, so nothing here can charge you."}
      </p>
    </div>
  );
}
