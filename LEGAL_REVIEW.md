# Legal document review — 2026-08-21

**This is not legal advice and I am not a lawyer.** What follows is an
engineering review: I compared `Terms_of_Use.md` and `Privacy_Policy.md`
against what the code actually does, and against `DATA_HANDLING.md`. Every
finding in Part 1 is a factual claim that was wrong about our own system —
that is checkable, and it is what I can usefully do. Part 2 lists the
questions that need a Nepal-qualified lawyer, and nothing in Part 1 removes
the need for that review.

The two documents still carry their "not reviewed by an attorney" footers.
Leave them until a lawyer has actually looked.

---

## Part 1 — Factual errors, now fixed

These were not matters of legal judgement. They were statements about
Baakhapaa that did not match Baakhapaa.

### Terms of Use

**1. It described tiers we do not sell.** §7 named "Free, Creator, and Pro".
The product ships free / pro / studio. A contract that prices a plan the
customer cannot buy is a dispute waiting to happen. → Fixed.

**2. It promised automatic renewal, which is false for two of three
gateways.** §7 said "Paid subscriptions renew automatically unless cancelled
before the renewal date." Khalti and eSewa have no subscription primitive —
a plan bought through either is a single payment covering one month, and
nothing renews. The Terms told the customer the opposite of how their plan
behaves. → Fixed, and it now says plainly that there is nothing to cancel
and we cannot charge again without them starting a new payment.

**3. It conditioned ownership of the writer's own work on payment.** §6 read
"Subject to your compliance with these Terms and payment of applicable fees,
you own the screenplay…". For a writing tool that is the wrong default in the
strongest possible way: a writer's own typed words must be theirs whether
they pay, whether their account lapses, and whether or not they are in breach.
→ Fixed: ownership of what you write is now unconditional, and separated from
the AI-generated output it was bundled with.

**4. It granted us a licence to use unpublished screenplays to "improve the
Service".** §6 said the licence covered "operate and improve". "Improve" is
the phrase under which training on user content normally sits. We do not do
that, and the whole free-tier proposition is that a free user's script is
never transmitted anywhere — so this clause contradicted both the code and
the pitch, and it is the single clause most likely to lose a writer's trust
if anyone read it carefully. → Fixed: the licence is now limited to operating
the Service, with an explicit statement that we do not train on user content
and that any change would be a separate opt-in.

**5. It named a retired API.** §9 cited "OpenAI DALL-E". DALL·E was shut down
in the API on 12 May 2026 and the code now uses gpt-image. It also omitted
Khalti and eSewa entirely. → Fixed.

### Privacy Policy

**6. §4 listed the wrong processors.** DALL·E again; no Khalti, no eSewa, no
mention of Pollinations (opt-in, off by default, and it puts the image prompt
in a URL). → Fixed.

**7. §5 treated all transfers as cross-border.** Khalti and eSewa are Nepali
companies — paying through them keeps payment data in Nepal. That is a
genuine compliance point in our favour under the Data Act 2079 and it was
being given away. → Fixed.

**8. §8 retention was an unfilled placeholder** (`[30/60/90] days`) and it
understated us. `purge_user()` deletes projects, scripts, versions, scenes,
frames, comments — including comments left on other people's projects — and
payment receipts, in one operation. Deletion is immediate, not eventual.
→ Fixed, and now describes what is and is not touched.

**9. §1 overclaimed what we collect.** It said we collect "feature usage".
We run no analytics and build no behavioural profile. Claiming collection we
do not perform is its own compliance problem. → Fixed.

**10. It omitted the strongest privacy property we have.** The free tier's
entire craft layer runs in-process with local embeddings, so a free user's
script is transmitted to nobody. That was documented in DATA_HANDLING.md and
absent from the policy. → Added.

---

## Part 2 — Needs a Nepal-qualified lawyer

I cannot answer these and neither can the templates.

1. **Is the consent model valid?** §3 relies on consent-by-registration under
   the Individual Privacy Act 2075. Whether that is sufficient for processing
   creative work, and whether AI processing needs separate consent, is a legal
   question.

2. **Cross-border transfer adequacy.** §5 asserts we "only transfer data to
   jurisdictions with adequate data protection standards". Nobody has assessed
   whether the US meets the Data Act 2079 standard. That sentence is currently
   an assertion, not a finding.

3. **Age threshold.** §9 uses under-13, a US (COPPA) number. Nepal's threshold
   may differ, and **the product has no age gate at all** — registration asks
   for name, email and password only. Either the clause or the product needs
   to change.

4. **Refunds.** §7 says fees are non-refundable. Nepali consumer protection
   law may override that, and a one-month prepayment that lapses is a
   different shape from a subscription — worth checking that "non-refundable"
   survives contact with a regulator.

5. **AI output and copyright.** §5 disclaims originality of AI output. Whether
   AI-generated screenplay text is copyrightable in Nepal, and who owns it,
   is unsettled almost everywhere.

6. **Liability cap.** §12 disclaims consequential damages. Enforceability
   against a consumer in Nepal is a lawyer's question.

7. **Breach notification.** §6 promises notification "consistent with Data Act
   2079 expectations". Somebody should confirm the actual statutory deadline
   and who must be told — and then we need a process, which does not exist.

8. **Khalti / eSewa merchant agreements.** Signing those imposes terms of
   their own. One is already load-bearing in the code: Khalti's merchant terms
   prohibit levying the service charge on customers, which is why the Rs 5.65
   is ours and the writer pays Rs 999 flat.

---

## Before either document goes live

Placeholders still to fill: `[DATE]` and `[YOUR EMAIL]` (three occurrences
across the two files). A privacy policy with no contact address does not
satisfy the access and deletion rights it grants.

There is also a process gap behind §7 of the Privacy Policy: it grants rights
to access, correct and object, and the product implements only deletion.
Access and correction currently have no route other than emailing a person.
