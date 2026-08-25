import React, { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "../services/api";
import { authErrorMessage } from "../utils/apiError";

/**
 * Sign in, or sign up, with Google.
 *
 * Renders nothing at all unless the server says it can handle it. That check
 * is the point: `GOOGLE_CLIENT_ID` is per-deployment, and this build runs in
 * demo mode by default with no keys of any kind. A Google button that fails on
 * click is worse than no Google button — it reads as the product being broken
 * rather than as a feature this deployment has not configured.
 *
 * Google's script is loaded on demand rather than in index.html so a
 * deployment without a client id never contacts Google at all, and the sign-in
 * page has no third-party request on its critical path.
 *
 * One button for both sign-up and sign-in. The server decides whether the
 * verified account is new, already known, or an existing password account to
 * link to — none of which the user should have to know before pressing it.
 */
const GSI_SRC = "https://accounts.google.com/gsi/client";

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();

    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("blocked")));
      return;
    }

    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("blocked"));
    document.head.appendChild(script);
  });
}

export default function GoogleSignInButton({ onSuccess, onError, text = "signin_with" }) {
  const [clientId, setClientId] = useState(null);
  const [ready, setReady] = useState(false);
  const holder = useRef(null);

  const handleCredential = useCallback(
    async (response) => {
      try {
        await onSuccess(response.credential);
      } catch (err) {
        onError(authErrorMessage(err, "Google sign-in failed. Please try again."));
      }
    },
    [onSuccess, onError]
  );

  // Ask the server first. `google: false` means this deployment has no client
  // id, and the component stays invisible.
  useEffect(() => {
    let cancelled = false;
    auth
      .providers()
      .then((res) => {
        // Both halves are required. `google: true` with no id would render a
        // Google widget initialised with `client_id: undefined`, which fails
        // inside Google's script where this component cannot report it.
        const id = res.data?.google && res.data?.google_client_id;
        if (!cancelled && typeof id === "string" && id) setClientId(id);
      })
      .catch(() => {
        // Unreachable server is already reported by the form's own submit path;
        // silently hiding the button is the right failure here.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!clientId || ready) return;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !holder.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredential,
        });
        window.google.accounts.id.renderButton(holder.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          width: 320,
          text,
        });
        setReady(true);
      })
      .catch(() => {
        // Blocked by an extension, an offline machine, or a network policy.
        // The email and password form is right there and still works.
        if (!cancelled) onError("Google sign-in could not load. Use your email and password.");
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, ready, handleCredential, text, onError]);

  if (!clientId) return null;

  return (
    <div className="mb-6">
      <div ref={holder} className="flex justify-center" />
      <div className="flex items-center gap-3 mt-6" aria-hidden="true">
        <span className="h-px flex-1 bg-borderSoft" />
        <span className="text-[11px] uppercase tracking-wider text-inkMuted">or</span>
        <span className="h-px flex-1 bg-borderSoft" />
      </div>
    </div>
  );
}
