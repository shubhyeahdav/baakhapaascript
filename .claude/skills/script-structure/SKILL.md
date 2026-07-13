---
name: script-structure
description: The structural screenwriting knowledge behind Baakhapaa — beat grammars for shorts/scenes/web series and the proven techniques distilled from analyzed films and series (Hollywood, Bollywood, Malayalam, Korean, Japanese, TVF-style, K-drama, Western prestige, shorts categories). Use this skill whenever writing, generating, critiquing, or restructuring any script, scene, three-act outline, episode, reel/short, hook, or beat sheet in this repo, AND whenever analyzing a new film/series/short into a structural pattern for knowledge_base.json. Trigger even if the user just says "make this scene better", "why is this structure weak", or "add this movie to the knowledge base".
---

# Script Structure — the writing playbook

This skill carries the *craft* layer of Baakhapaa's generation system: the
writing-structure knowledge extracted from every analyzed script. The RAG
pipeline (`script-rag` skill) retrieves 3 patterns automatically per
generation; use this skill when YOU are the writer/analyst — critiquing a
structure, writing scenes, improving AI prompts, or producing new analyses.

**Read `references/structure-playbook.md` before doing any structural writing
or critique work** — it holds the per-platform beat grammars and the technique
library distilled from all analyzed sources. This file covers how to apply it
and how to analyze new sources.

## The three platform grammars (summary — full versions in the playbook)

- **Shorts (15–90 s):** hook (0–3 s, typed) → escalation → core payoff →
  optional twist → soft CTA. Every beat has a retention function; the hook
  type is the single highest-leverage choice.
- **Scene / movie:** setup → inciting incident → rising tension → crisis →
  resolution. Every beat must answer: what dramatic question does it pose or
  answer, what changes, and what are characters NOT saying (subtext).
- **Web series episode:** the scene grammar PLUS an `episode_hook_type` (the
  mechanism driving the next-episode click) and a `season_arc_position`
  (setup / midpoint / finale) that changes what the ending owes the audience.

## Baakhapaa house constraints (apply to all generated writing)

From `script_engine.BAAKHAPAA_STYLE`: young Nepali adults (18–30), real
decisions, urban-Kathmandu Nepali/English code-mixing, themes of ambition vs
family expectation. Avoid melodrama, cliché resolutions, formal stiffness.
Bilingual output = dialogue in Devanagari, action lines in English. A
structurally perfect beat sheet that ignores these reads as generic — the
techniques in the playbook must be dressed in this world.

## Analyzing a new source into the knowledge base

The analysis loop: know the source → extract *transferable mechanics* → write
one `knowledge_base.json` entry → run the loader (plumbing details in the
`script-rag` skill).

Entry quality bar — the difference between a useful pattern and noise:

- **`one_line_takeaway` = a technique someone could apply to a different
  story.** Test: replace the source's nouns with any other story's nouns —
  does the sentence still teach something? "Let the inciting opportunity be
  something the protagonist wants, so the audience becomes complicit" ✓.
  "A poor family infiltrates a rich household" ✗ (plot, not technique).
- **`structural_pattern` = mechanics, 2–4 sentences:** how beats are arranged,
  where the midpoint pivots, what is withheld and when it detonates, what the
  climax converges. Never a plot recap.
- **Structural analysis only, in your own words.** No dialogue quotes, no
  copyrighted text, nothing over 600 chars per field (loader-enforced).
- Spread new batches across traditions and source types — retrieval variety
  depends on library variety.

Analysis prompt template (for generating entries with Claude):

```
Analyze the STRUCTURE of <title> as a screenwriting pattern. Do not retell
the plot and do not quote any dialogue. Produce JSON with: title_ref,
source_type (movie|webseries|short), genre, origin_tradition,
one_line_takeaway (one transferable technique, applicable to unrelated
stories), structural_pattern (2–4 sentences on beat mechanics: setup shape,
inciting mechanism, midpoint pivot, what is withheld, how the climax
converges).
```

## Applying patterns when writing or critiquing

1. Identify the platform → use its grammar from the playbook.
2. Pick 2–3 techniques matching the request's *problem* (the playbook indexes
   them by problem: weak hook, saggy middle, unearned ending, flat antagonist,
   no next-episode pull).
3. Adapt, never transplant: techniques carry over, plot surfaces don't. Never
   name the source works in generated output.
4. Critique against the grammar: every beat should state what changes and what
   question it answers — a beat that changes nothing is a cut candidate. For
   shorts, any second without a retention function is a drop-off risk.
