import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Warn a writer before their plan stops working.
 *
 * Khalti and eSewa have no subscription primitive — they take one payment,
 * once — so a plan bought through either simply expires. Nothing renews, and
 * until now nothing said so: a writer would open the app one morning to find
 * AI generation returning 403 with no explanation and no warning that it was
 * coming. That is the worst version of this failure, because it looks like the
 * product broke rather than like a month ended.
 *
 * A Stripe subscription leaves `subscription_expires_at` NULL — Stripe owns the
 * renewal — so this correctly says nothing to those users.
 *
 * This is the in-app half. The other half is `renewals.py`, which mails the
 * writer who has NOT opened the app.
 *
 * THE TWO HALVES ARE ORDERED, AND THE ORDER IS THE POINT. Both windows were
 * written as 7 days, in two files, with nothing connecting them — so the
 * banner and the email fired on the same day and which arrived first was a
 * race. A writer who uses the product should learn that their plan is ending
 * from the product, not from an email about it; the email exists for the
 * person the banner cannot reach.
 *
 * `tests/test_renewal_ordering.py` in the backend fails if this number ever
 * stops being larger than `renewals.WARN_DAYS`.
 */

// Fourteen days, against the mailer's seven. Long enough to act on, short
// enough not to nag for half the month, and — the part that matters —
// strictly earlier than the email. Exported so the test can read it.
export const WARN_WITHIN_DAYS = 14;

export function daysUntil(iso, now = new Date()) {
  if (!iso) return null;
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end - now) / 86400000);
}

export default function PlanNotice() {
  const { user } = useAuth();
  const days = daysUntil(user?.subscription_expires_at);

  // NULL expiry means the plan is not time-boxed: free, or Stripe-managed.
  if (days === null) return null;
  if (days > WARN_WITHIN_DAYS) return null;

  // An expired plan already reads as `free` from /auth/me, so the tier here
  // cannot be used to name what lapsed — the date is what we know.
  const lapsed = days <= 0;

  return (
    <div
      role="status"
      className={`mx-8 md:mx-14 mt-2 mb-1 rounded-xl border px-4 py-2.5 flex items-center gap-3 ${
        lapsed
          ? "border-amber-400/30 bg-amber-400/10"
          : "border-borderSoft bg-elevated/50"
      }`}
    >
      <p className="text-[12.5px] text-inkSoft leading-snug flex-1">
        {lapsed ? (
          <>
            <span className="text-ink font-semibold">Your plan has ended.</span>{" "}
            Your work is safe and the free features still work — pattern
            recommendations, the craft checks and PDF export. Paid features need
            another month.
          </>
        ) : (
          <>
            <span className="text-ink font-semibold">
              Your plan ends in {days} {days === 1 ? "day" : "days"}.
            </span>{" "}
            Khalti and eSewa charge one month at a time, so nothing renews on
            its own.
          </>
        )}
      </p>
      <Link to="/pricing" className="btn-gold text-[11.5px] py-1.5 px-3.5 shrink-0">
        {lapsed ? "Renew" : "Renew now"}
      </Link>
    </div>
  );
}
