# Free AI providers — what fits, and what was ruled out

Researched 2026-10-29. Free tiers change often; the limits below are what each
provider's own page said that day, and the dates matter.

## The recommendation

**Groq, model `llama-3.3-70b-versatile`.** Wired up as the `website (free AI)`
launcher. You add one line to `baakhapaa-backend/.env`:

```
GROQ_API_KEY=gsk_...
```

Get the key free, without a card, at <https://console.groq.com/keys>. Then
turn on **Zero Data Retention** in Groq's Data Controls settings. It is free
for every account and it is the setting that makes this defensible for
unpublished scripts.

No transport code changed. `script_engine.py` already had a Groq preset
defaulting to exactly this model.

## Why this one

Four things decide it for this product, in this order.

| | Groq | Gemini (free) | OpenRouter (free) |
|---|---|---|---|
| **Does the free tier keep or train on the script?** | Not retained by default; ZDR free to all | **Yes: used to improve Google products, human reviewers may read it** | Depends on the upstream provider per model |
| Free requests / day | ~1,000 per model | ~1,000–1,500 (unconfirmed) | **50** (1,000 only after a $10 top-up) |
| Card required | No | No | No for 50/day |
| Fits the existing code | Preset already exists | Needs `custom` + base URL | Needs `custom` + base URL |

**Privacy came first, and it ruled Gemini out.** Every request carries a
writer's unpublished script. Google's Gemini API terms say unpaid usage may be
used to improve Google's products, with human reviewers reading inputs and
outputs. That is the wrong default for this content however generous the
quota is. Groq's own "Your Data" page says inference data is not retained by
default, and lets any account turn on Zero Data Retention.

**OpenRouter's free tier is too small.** 50 requests a day is one writer's
afternoon.

**Why a non-reasoning model.** Groq's other free text models (`gpt-oss-120b`,
`gpt-oss-20b`, `qwen3.8-27b`) are reasoning models. A reasoning model spends
`max_tokens` on thinking before it writes, and `script_engine.py` already
documents one returning an empty answer after spending its whole budget.
`llama-3.3-70b-versatile` is a production, non-reasoning model, so that failure
cannot happen.

## What is not known yet

- **Nepali quality is untested.** Llama 3.3 is not officially trained for
  Nepali. It is for Hindi, which shares the Devanagari script. No published
  benchmark compares the free models on Devanagari Nepali. A 2026 study on
  *romanised* Nepali found base Llama, Mistral and Qwen all failed zero-shot.
  Test it on real Nepali scenes before telling a writer it works.
- **Groq's training position is not on the page checked.** "Your Data" covers
  retention, not training. Third-party summaries say Groq's Data Processing
  Addendum prohibits training on customer data. Read the DPA before relying on
  it.
- **The free limit might be Developer-plan numbers.** Groq's rate-limit table
  is introduced as "base limits for the Developer plan". Your account's real
  numbers are at console.groq.com/settings/limits.

## Before this goes anywhere near the live site

`script_engine.py` prints this on start, and it is right:

> Development only; the product ships on Claude, and the privacy policy must
> name whoever actually receives it.

`Privacy_Policy.md` names Anthropic as the recipient of script text. Sending
drafts to Groq in production without changing it would make the policy false.
Update it, and `DATA_HANDLING.md`, first.

## Sources

- [Groq — Your Data](https://console.groq.com/docs/your-data)
- [Groq — Rate limits](https://console.groq.com/docs/rate-limits)
- [Groq — Models](https://console.groq.com/docs/models)
- [Groq — Reasoning](https://console.groq.com/docs/reasoning)
- [Simon Willison on the Gemini API terms](https://simonwillison.net/2024/Oct/17/gemini-terms-of-service)
- [ZDNet — what developers trying Gemini should know about their data](https://www.zdnet.com.au/article/what-developers-trying-out-google-gemini-should-know-about-their-data/)
- [OpenRouter — Free LLM APIs compared](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/)
- [TrueFoundry — OpenRouter rate limits](https://www.truefoundry.com/ja/blog/openrouter-rate-limits-your-free-tier-depends-on-what-youve-already-paid)
- [Benchmarking LLMs on Romanized Nepali (arXiv 2604.14171)](https://arxiv.org/pdf/2604.14171)
