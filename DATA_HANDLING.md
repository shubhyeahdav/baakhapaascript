# Where a script actually goes

Written 2026-08-18 by tracing the code, not the docs. This is the input the
Privacy Policy and `Data_Compliance_Checklist.md` should be rewritten from —
both are currently unreviewed templates that describe a system nobody verified.

An unproduced screenplay is the most valuable and most private thing a user of
this product owns. Two failures matter more here than anywhere else: content
going somewhere they did not agree to, and content staying after they asked for
it to be gone.

## 1. What is stored, and where

| Table | Holds | Notes |
|-------|-------|-------|
| `scripts.content` | The full draft, in plain text | The primary asset |
| `versions.content` | A **complete copy** of the draft per snapshot | Easy to forget; it is the whole script again, N times |
| `scenes.draft_json` | Slugline, cast, and a ~400-char summary of each scene's action | Derived from the draft |
| `comments.content` | Notes, which routinely quote the script | |
| `storyboard_frames.image_url` | A remote URL for each frame | Server-written only |
| `projects` | Title, genre, tone, language, runtime | |
| `users` | Email, name, bcrypt hash, tier, plan expiry, onboarding answers | |
| `payments` | Tier, gateway, amount, status, our reference and theirs | **No card or wallet details.** The gateway holds those; we never see them |

Storage is Supabase (Postgres) in production, or a local SQLite file
(`baakhapaa_local.db`) in demo mode.

## 2. What leaves the server

| Destination | What is sent | When | Controlled by |
|---|---|---|---|
| **Anthropic** | The scene brief, or the full scene text being improved | Only on `generate-scene` / `improve` / `suggest` — **Pro/Studio only** | `LLM_PROVIDER` / `ANTHROPIC_API_KEY` |
| **OpenAI (DALL-E)** | Scene description, location, cast, time of day, mood | On storyboard generation | `OPENAI_API_KEY`, `STORYBOARD_USES_DRAFT_TEXT` |
| **Groq** | Same as Anthropic | Only when `LLM_PROVIDER=groq` is set deliberately | `LLM_PROVIDER` |
| **Pollinations** | The image prompt, **in the URL path** | Only when `STORYBOARD_PROVIDER=pollinations` | Opt-in, off by default |
| **Khalti** | Name, email, amount, and our order reference. No script content | At checkout, and again to confirm the payment | `KHALTI_SECRET_KEY` |
| **eSewa** | Amount and our transaction reference. No name, email, or script content | At checkout, and again to confirm | `ESEWA_SECRET_KEY` |
| **Stripe** | Email and tier. No script content | At checkout | `STRIPE_SECRET_KEY` |
| **placehold.co** | The shot type only, e.g. `Wide+Shot` | Demo mode | No script content |

### What never leaves

**No payment instrument ever touches this server.** Every gateway takes the
card or wallet credentials on its own domain; what comes back is a reference and
a status. A `payments` row is a receipt, not a payment method, and account
deletion takes it with everything else — no billing history survives an erasure.
If accounting or tax rules later require retention, that is a deliberate change
to make and to disclose, not a default to drift into.

The whole free-tier craft layer runs in-process: the linter, the benchmark,
pattern retrieval, the review, the parser and every export. Embeddings are local
(fastembed ONNX). **A free user's script is never transmitted anywhere** —
that is a genuine privacy property, and it is worth saying out loud in
marketing rather than leaving buried in the architecture.

### One consequence worth flagging

Since scene rows started tracking the written draft (2026-08-18), the text sent
to image generation is the writer's **own action lines** rather than a generated
beat summary. Better frames, more of the user's unpublished work leaving the
building. Set `STORYBOARD_USES_DRAFT_TEXT=false` to draw from the structure beat
instead — more generic boards, nothing the writer typed transmitted.

## 3. Fixed on 2026-08-18

- **Deleting now deletes the content.** Postgres cascades through the schema's
  foreign keys, but the local store has no relationships, so "delete project"
  left the full script and every version snapshot on disk — in the mode every
  developer and every test actually runs in. `database.purge_projects()` /
  `purge_user()` make deletion mean the same thing in both modes.
- **Users can erase their account.** `DELETE /auth/me` (retype your email to
  confirm) removes every project, draft, snapshot, board and comment. Projects
  shared *with* the user belong to someone else and are untouched — only the
  membership goes. Previously there was no way to leave.
- **The provider fallback is gone.** A missing `ANTHROPIC_API_KEY` used to fall
  through to Groq automatically — one fumbled key and every script would go to a
  company the privacy policy does not name, signalled only by a startup log line.
  Third-party routing is now an explicit `LLM_PROVIDER=groq`.
- **Server-side request forgery closed.** The production package fetches frame
  images server-side. `image_url` was client-writable, so an editor could aim
  that fetch at cloud metadata (`169.254.169.254`), at localhost, or at anything
  on the private network. `image_url` is no longer client-writable, private and
  loopback addresses are refused, and redirects are not followed.

Covered by `tests/test_privacy.py` (29 tests).

## 4. Still open — decisions, not code

1. **Encryption at rest is Supabase's, not ours.** NFR03 claims "all user data
   encrypted at rest and in transit". In transit is true via TLS. At rest is
   whatever Postgres/Supabase does at the disk level — there is no
   application-level encryption of `scripts.content`. **Anyone with database
   credentials can read every script.** If that is not acceptable for the
   pitch, it needs designing now, not after launch.
2. ~~No token revocation.~~ **Closed 2026-08-18.** Tokens carry a generation
   number checked on every request, so `POST /auth/sign-out-everywhere` ends every
   session immediately, and a deleted account's token stops authenticating at
   once rather than staying valid for the rest of its week. Still worth doing:
   bump the generation on password change too.
3. **No access audit log.** Nothing records who opened or exported which script.
   With sharing and roles now live, "who read my draft" has no answer.
4. **AI provider retention is unverified.** Confirm current Anthropic and OpenAI
   API terms on retention and training use, and state them plainly in the policy.
   Do not assert what has not been read.
5. **No backup or retention policy.** How long deleted data survives in backups
   is exactly the proposal's own open question, and it is still unanswered.
6. **Legal review has not happened.** `Terms_of_Use.md`, `Privacy_Policy.md` and
   `Data_Compliance_Checklist.md` are templates.

## 5. Recommended next, in order

1. **Say what happens, in the product.** A line at the point of use — "improving
   this scene sends it to Anthropic" — beats a policy nobody opens. Users
   tolerate a lot when told; almost nothing when they find out later.
2. **Per-project consent, not per-deployment.** `STORYBOARD_USES_DRAFT_TEXT` is
   an operator switch. A writer with a sensitive project should be able to say
   "never send this one anywhere" themselves.
3. **Then decide on encryption at rest**, which is the only item here that is
   genuinely expensive and genuinely might not be worth it.
