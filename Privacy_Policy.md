# Privacy Policy — Baakhapaa

**Last updated: [DATE]**

This Privacy Policy explains how Baakhapaa ("we," "us," "our") collects,
uses, stores, and protects your personal information. It is written to
align with Nepal's **Individual Privacy Act, 2075 (2018)**, the **Privacy
Regulation, 2077 (2020)**, and the **Data Act, 2079 (2022)**, and follows
practices consistent with international frameworks (like GDPR) for our
international users.

## 1. Information We Collect

**Account information:** name, email address, password (stored as a
hashed value, never in plain text).

**Project content:** screenplay text, project metadata (genre, tone,
duration, language), storyboard images, comments, and version history you
create using the Service.

**Payment information:** if you subscribe to a paid tier, the payment itself
is taken by Khalti, eSewa or Stripe on their own pages. **No card number,
wallet PIN or bank credential ever reaches our servers.** What we keep is a
receipt: which plan, how much, whether it succeeded, when, and the reference
numbers needed to look the payment up with the gateway.

**Usage data:** our servers keep ordinary web logs, which include your IP
address, for security and rate limiting. We do not run analytics or
behavioural tracking, and we do not build a profile of how you use the
Service.

## 2. Purpose of Collection (disclosed per Data Act 2079 requirements)

We collect this data to:
- Create and manage your account
- Provide the core Service (AI script/storyboard generation, collaboration,
  export)
- Process subscription payments
- Improve the Service and fix bugs
- Communicate important updates (service changes, security notices)
- Comply with legal obligations

We do **not** sell your personal data to third parties.

## 3. Legal Basis and Consent

By registering an account, you consent to the collection and processing of
your data as described in this Policy, consistent with the consent
requirement under the Individual Privacy Act 2075. You may withdraw consent
at any time by deleting your account, subject to Section 7 below.

## 4. Third-Party Data Processors

We share data with the following categories of third parties, only as
necessary to operate the Service:
- **Anthropic** (Claude) — receives a scene brief, or the scene text being
  rewritten, when you use AI generation or improvement. **Paid tiers only.**
- **OpenAI** (gpt-image) — receives a scene description, location, cast, time
  of day and mood when you generate a storyboard.
- **Supabase** — our database provider, storing your account and project data.
- **Khalti / eSewa** — Nepali payment gateways. Receive the amount and our
  order reference; Khalti also receives your name and email. Neither receives
  any script content.
- **Stripe** — card payments. Receives your email and the plan. No script
  content.
- **Pollinations** — an optional image provider, **off by default**. If it is
  switched on, the image prompt is sent in the URL itself. We will tell you
  if we ever enable it.

### What is never sent anywhere

The free tier's craft layer runs entirely on our own servers: the linter, the
pattern recommendations, the review, the parser, every export, and the
similarity search behind them all. **If you are on the free plan, your script
is not transmitted to anyone.** That is a property of how the product is
built, not a promise we are asking you to take on trust.

We do not use your script to train or fine-tune any AI model, and we do not
permit our providers to do so on our behalf.

We require these providers to handle your data securely, but their own
privacy practices also govern how they process data on our behalf.

## 5. Cross-Border Data Transfer

Anthropic, OpenAI, Supabase and Stripe process data outside Nepal. Khalti and
eSewa are Nepali companies and your payment data stays in Nepal when you pay
through them — which is one reason both are offered.

Per the Data Act 2079, we only transfer data to jurisdictions with adequate
data protection standards, and solely for the purposes described in this
Policy.

## 6. Data Security

We implement reasonable technical safeguards, including:
- Password hashing (bcrypt)
- Encrypted connections (HTTPS/TLS) for data in transit
- Access controls limiting who can view your data
- JWT-based authentication with expiring sessions

No system is perfectly secure; we will notify affected users and relevant
authorities in the event of a data breach affecting personal information,
consistent with Data Act 2079 breach notification expectations.

## 7. Your Rights

Consistent with the Individual Privacy Act 2075 and Data Act 2079, you have
the right to:
- **Access** the personal data we hold about you
- **Correct** inaccurate data
- **Request deletion** of your account and associated data
- **Object** to processing that you believe violates your rights
- **Be informed** of the purpose of any new data collection

To exercise these rights, contact us at [YOUR EMAIL]. We will respond
within a reasonable time, generally within 30 days.

## 8. Data Retention

We retain your account and project data for as long as your account is
active.

**Deleting your account deletes your data immediately, not eventually.** Your
projects, scripts, every version snapshot, scenes, storyboard frames,
comments — including comments you left on other people's projects — and your
payment receipts are removed in the same operation. Projects shared *with*
you belong to their owner and are not touched; only your membership goes.

Deleting a single project removes that project's scripts, versions, scenes,
frames and comments in the same way.

Backups, where they exist, are overwritten on their normal cycle.

## 9. Children's Privacy

The Service is not directed at children under 13. We do not knowingly
collect data from children under this age.

## 10. Cookies and Tracking

We use minimal cookies/local storage strictly necessary for authentication
(storing your login session). We do not currently use third-party
advertising trackers.

## 11. Changes to This Policy

We may update this Privacy Policy periodically. Material changes will be
communicated via email or an in-app notice before they take effect.

## 12. Contact and Complaints

For privacy questions or to exercise your rights: [YOUR EMAIL]

If you are a Nepal-based user and believe your rights under the Individual
Privacy Act 2075 have been violated, you may file a complaint at your local
District Court within 3 months of the incident, as Nepal does not yet
have a dedicated data protection regulator.

---
*This document is a template starting point reflecting Nepal's current
privacy framework as of 2026 and general international best practice. It
has not been reviewed by a licensed attorney. Nepal's data protection
regime is still evolving (a comprehensive Personal Data Protection Act is
under discussion) — have this reviewed by a Nepal-qualified lawyer before
processing real user data or payments.*
