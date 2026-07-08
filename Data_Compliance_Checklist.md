# Data Compliance Checklist — Baakhapaa

Practical, actionable checklist mapped to Nepal's actual current legal
framework (as of 2026) plus general international good practice, since your
pricing includes USD tiers for international users.

## Nepal's Applicable Laws (what actually governs you)

| Law | What it covers |
|---|---|
| **Constitution of Nepal, Article 28** | Fundamental right to privacy of body, data, correspondence |
| **Individual Privacy Act, 2075 (2018)** | Nepal's core privacy law — consent, disclosure, data subject rights |
| **Individual Privacy Regulation, 2077 (2020)** | Implementing rules for the Privacy Act |
| **Data Act, 2079 (2022)** | Data governance — security, breach notification, cross-border transfer rules |
| **Electronic Transactions Act, 2063 (2008)** | Cybercrime, digital signatures, electronic records |
| **Payment Systems-Related Unified Directives, 2025** | Applies once you process real payments |

**Important gap to know:** Nepal has **no dedicated data protection
regulator** yet — enforcement runs through the District Court, and there's
no mandatory breach notification portal like GDPR's. A comprehensive
Personal Data Protection Act is still being discussed as of 2026. This
means your compliance bar today is: follow the Privacy Act's core
principles (consent, disclosure of purpose, security) even though
enforcement infrastructure is thin — because it will catch up, and because
your international (US/EU-adjacent) users may expect GDPR-style handling
regardless.

## Your Compliance Checklist

### Before collecting any real user data
- [ ] Privacy Policy published and linked from registration page (see
      Privacy_Policy.md)
- [ ] Terms of Use published and linked from registration page
- [ ] Consent checkbox at registration ("I agree to the Terms of Use and
      Privacy Policy") — not pre-checked, must be an active action
- [ ] Clear statement of *why* you collect each piece of data (required
      under Data Act 2079's transparency provision)

### Data security (Data Act 2079 requirement)
- [ ] Passwords hashed (bcrypt) — ✅ already done in your codebase
- [ ] HTTPS/TLS enforced in production (not just localhost)
- [ ] JWT_SECRET is strong and not the placeholder default — ⚠ flagged in
      your own audit, fix before launch
- [ ] Database access restricted (Supabase Row Level Security enabled)
- [ ] No sensitive data (passwords, API keys) in logs or error messages

### Payment data (once Stripe/Khalti is wired up)
- [ ] Never store raw card numbers yourself — let Stripe/the payment
      processor handle PCI compliance
- [ ] Payment Systems-Related Unified Directives 2025 compliance — use a
      licensed/regulated payment gateway for Nepal-based transactions
      (Khalti, eSewa, or similar are already compliant; don't build your
      own payment collection)

### Data subject rights (must be operationally possible, not just written)
- [ ] A way for users to request their data (even if manual/email-based
      for now — "email us and we'll export your data within 30 days" is
      acceptable at your current stage)
- [ ] A way for users to delete their account and have data removed
- [ ] A way for users to correct inaccurate account info (name/email edit)

### Cross-border transfer (relevant since Anthropic/OpenAI/Supabase are
international)
- [ ] Privacy Policy discloses that data may be processed outside Nepal
- [ ] Confirm your chosen Supabase region and note it (EU/US regions both
      have adequate protection standards recognized internationally)

### Breach response (have a plan, even a simple one)
- [ ] A basic incident response plan: who gets notified internally, how
      affected users are informed, rough timeline (Data Act 2079 expects
      breach notification to affected individuals and government)
- [ ] At minimum: rotate credentials, assess scope, notify affected users
      via email within a few days of discovering a breach

### If you ever expand to EU/UK users specifically
- [ ] GDPR technically may apply if you have EU users — the checklist
      above covers ~80% of GDPR's practical requirements already; revisit
      with a lawyer if EU user volume becomes meaningful

## What NOT to worry about yet

- Registering with a "Data Protection Authority" — Nepal's isn't
  operational yet, nothing to register with
- Formal international data transfer agreements (SCCs, etc.) — overkill
  at your current stage, revisit if you raise investment or scale
  significantly
- Cookie consent banners — you're not using tracking/advertising cookies,
  so this isn't currently required

## When to get a real lawyer involved

The moment you: (a) process real payments at meaningful volume, (b) raise
outside investment, or (c) have a data breach — get a Nepal-qualified
lawyer to review your actual practices against this checklist, not just
the documents.

---
*Based on Nepal's Individual Privacy Act 2075, Privacy Regulation 2077,
and Data Act 2079 as understood as of 2026. This framework is actively
evolving — recheck before major launches or funding events.*
