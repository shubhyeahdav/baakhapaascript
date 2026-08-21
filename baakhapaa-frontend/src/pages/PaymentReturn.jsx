import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { subscription } from "../services/api";
import { useAuth } from "../context/AuthContext";

/**
 * Where every gateway drops the user back.
 *
 * The three of them return different things — Khalti a `pidx`, eSewa a base64
 * `data` blob, Stripe a `session_id` — so this page's only job is to forward
 * the whole query string to the server and let it ask the gateway what really
 * happened. Nothing here decides whether a payment succeeded; a query string
 * that says `status=Completed` is written by the browser we received it from.
 *
 * "Pending" is a real outcome, not an error. Wallet confirmations can lag, and
 * telling a writer their payment failed when the money has left their account
 * is worse than asking them to check again.
 */
export default function PaymentReturn() {
  const [params] = useSearchParams();
  // The provider comes from the path (`/payment/return/esewa`). The query
  // string is entirely the gateway's — see the route comment in App.jsx.
  const { provider: providerFromPath } = useParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [state, setState] = useState({ phase: "checking" });
  // React 18 StrictMode mounts twice in development; the server is idempotent
  // but a doubled request makes the logs lie about what happened.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // `?provider=` is the older form, kept for a payment that was already in
    // flight when this deployed.
    const provider = providerFromPath || params.get("provider");
    if (!provider) {
      setState({ phase: "failed", detail: "This page was opened without a payment to check." });
      return;
    }

    const all = {};
    params.forEach((value, key) => {
      all[key] = value;
    });

    subscription
      .verify(provider, all)
      .then(async (res) => {
        const result = res.data;
        if (result.status === "completed") {
          // The tier changed server-side; the cached user object has not.
          if (refreshUser) await refreshUser();
          setState({ phase: "completed", tier: result.tier, expiresAt: result.expires_at });
          setTimeout(() => navigate("/dashboard?checkout=success"), 2500);
        } else {
          setState({ phase: result.status, detail: result.detail });
        }
      })
      .catch((err) => {
        setState({
          phase: "failed",
          detail: err.response?.data?.detail || "We could not reach the server to confirm this payment.",
        });
      });
    // Deliberately runs once: `started` guards it, and re-verifying on every
    // render would poll the gateway.
  }, []);

  const formatExpiry = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  };

  const body = {
    checking: {
      title: "Confirming your payment…",
      note: "We are checking this with the payment provider. Please don't close this page.",
    },
    completed: {
      title: "Payment confirmed",
      note: null,
    },
    pending: {
      title: "Not confirmed yet",
      note: "Your payment provider hasn't confirmed this one yet. If money has left your account it will land shortly — reopen this page from Settings rather than paying again.",
    },
    underpaid: {
      title: "Amount didn't match",
      note: "The amount received doesn't cover this plan, so it hasn't been activated. Nothing further has been charged.",
    },
    failed: {
      title: "Payment not completed",
      note: "Nothing was charged. You can try again, or use a different payment method.",
    },
  }[state.phase] || { title: "Payment not completed", note: null };

  return (
    <div className="min-h-screen cine-bg text-ink flex items-center justify-center px-6">
      <div className="bg-surface border border-borderSoft rounded-2xl p-9 max-w-md w-full text-center">
        <p className="text-inkMuted text-xs tracking-[0.24em] uppercase mb-5">Payment</p>

        <h1 className="font-display text-2xl mb-3">{body.title}</h1>

        {state.phase === "checking" && (
          <div className="flex justify-center my-6" aria-live="polite">
            <span className="w-6 h-6 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          </div>
        )}

        {state.phase === "completed" && (
          <p className="text-inkSoft text-sm mb-4">
            Your <span className="text-gold capitalize">{state.tier}</span> plan is active.
            {formatExpiry(state.expiresAt) && (
              <>
                {" "}It runs until{" "}
                <span className="text-ink">{formatExpiry(state.expiresAt)}</span>.
              </>
            )}
          </p>
        )}

        {body.note && <p className="text-inkMuted text-sm mb-6">{body.note}</p>}
        {state.detail && state.phase !== "completed" && (
          <p className="text-inkMuted text-xs mb-6">{state.detail}</p>
        )}

        {state.phase !== "checking" && (
          <div className="flex gap-3 justify-center">
            <Link to="/dashboard" className="btn-ghost">Back to Dashboard</Link>
            {state.phase !== "completed" && (
              <Link to="/pricing" className="btn-gold">Try again</Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
