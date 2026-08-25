"""Recut the curated hook corpus along axes a CONTENT CREATOR actually uses.

Archetype ('pov_realism', 'quote_dialogue') is a linguistic label. A creator asks:
  - What is my video trying to DO?            -> intent
  - Can I shoot this with what I have?        -> production
  - Can I reuse it, or is it one creator's?   -> template mining
  - Is it worth my time?                      -> usability score

Input : hooks_curated.csv (from curate_hooks.py)
Output: hooks_by_usability.csv, hook_templates.csv, usability_manifest.json
"""
import sys, io, os, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, numpy as np

D = r'C:\baakhapaa\docs\hooks'
df = pd.read_csv(os.path.join(D, 'hooks_curated.csv'))
# object dtype forces pandas onto Python's `re` — pyarrow's RE2 engine rejects
# \u escapes and several constructs used below.
h = df.hook.fillna('').astype(object)
low = h.str.lower().astype(object)

def has(pat): return low.str.contains(pat, regex=True, na=False)

# ---------------------------------------------------------------- 1. INTENT
# What job is this hook doing for the creator? Lexical signals win over
# archetype, because archetypes like `question` (n=2508) span several jobs.
ARCH_INTENT = {
 'demonstration':'TEACH', 'listicle':'TEACH', 'problem_solution':'TEACH',
 'product_showcase':'SELL', 'invitation':'SELL', 'benefit_promise':'SELL',
 'pov_realism':'RELATE', 'relatable_identity':'RELATE', 'quote_dialogue':'RELATE',
 'story_teaser':'RELATE',
 'shock_statement':'ENTERTAIN', 'reveal_tease':'ENTERTAIN',
 'outcome_proof':'PROVE', 'authority':'PROVE', 'comparative':'PROVE',
 'contrarian':'PROVOKE', 'warning_mistake':'PROVOKE', 'curiosity_gap':'PROVOKE',
 'question':'PROVOKE', 'direct_address':'PROVOKE', 'imperative':'PROVOKE',
}
intent = df.archetype.map(ARCH_INTENT).fillna('RELATE')

SIG = [  # (signal regex, intent) — applied in order, later wins
 (r'\bhow to\b|\btutorial\b|\bstep by step\b|\bhere\'?s how\b|\bexplained\b|\bguide\b', 'TEACH'),
 (r'\b\d+ (things|ways|tips|steps|hacks|rules|foods|apps|tools)\b', 'TEACH'),
 (r'\b(download|link in bio|get the app|try (it|this) (free|now)|use code|sign up|shop|buy)\b', 'SELL'),
 (r'\b(i (made|lost|earned|saved|grew|went from)|results? after|before and after|from \$?[\d,]+ to)\b', 'PROVE'),
 (r'\b(as an? [a-z]+,|certified|licensed|dermatologist|doctor|\d+ years? (of|as))\b', 'PROVE'),
 (r'\b(unpopular opinion|hot take|nobody tells you|you\'?re doing .{0,20}wrong|stop )\b', 'PROVOKE'),
 (r'^\s*(pov|me when|when you|nobody:)\b|\biykyk\b', 'RELATE'),
]
for pat, lab in SIG:
    intent = intent.mask(has(pat), lab)
df['intent'] = intent

# ---------------------------------------------------------------- 2. PRODUCTION
# What do you physically have to shoot? Ordered cheapest-last so the most
# demanding requirement wins.
prod = pd.Series('TEXT_ON_BROLL', index=df.index)
prod = prod.mask(has(r'\b(i |i\'?m |my |me\b|we |our )'), 'TALKING_HEAD')
prod = prod.mask(has(r'^\s*(pov|me when|when you|nobody:)|["\u201c].{4,}["\u201d]'), 'SKIT_OR_POV')
prod = prod.mask(has(r'\bhow to\b|\btutorial\b|\bstep\b|\bsettings\b|\bclick\b|\bswipe\b|\bapp\b'), 'SCREEN_DEMO')
prod = prod.mask(has(r'\bbefore and after\b|\bfrom \$?[\d,]+ to\b|\bresults? after\b|\bday \d+\b|\btransformation\b'), 'TRANSFORMATION')
df['production'] = prod

EFFORT = {'TEXT_ON_BROLL':1, 'TALKING_HEAD':2, 'SKIT_OR_POV':3, 'SCREEN_DEMO':3, 'TRANSFORMATION':4}
df['effort'] = df.production.map(EFFORT)

# ---------------------------------------------------------------- 3. FUNNEL
df['funnel'] = np.where(df.intent.isin(['SELL','PROVE']), 'CONVERT',
               np.where(df.intent.isin(['TEACH']), 'NURTURE', 'REACH'))

# ---------------------------------------------------------------- 4. TEMPLATE MINING
# A hook is REUSABLE if its opening stem recurs across many *different creators*
# and categories. Single-creator stems are that brand's voice, not a template.
def stem(s, n=4):
    w = re.sub(r'[^\w\s\']', ' ', s.lower()).split()
    return ' '.join(w[:n]) if len(w) >= n else None

for n in (3, 4, 5):
    df[f'stem{n}'] = h.map(lambda s: stem(s, n))

rows = []
for n in (5, 4, 3):
    g = df.groupby(f'stem{n}').agg(
        instances=('hook','size'), creators=('username','nunique'),
        categories=('main_category','nunique'), median_om=('om','median'),
        median_views=('views','median'), intent=('intent', lambda s: s.mode().iat[0]),
        production=('production', lambda s: s.mode().iat[0]),
        example=('hook','first'))
    g = g[(g.instances >= 5) & (g.creators >= 3)]        # recurs, and not one brand
    g['n_words'] = n
    rows.append(g.reset_index().rename(columns={f'stem{n}':'stem'}))

tpl = pd.concat(rows, ignore_index=True)
# Prefer the longest stem; drop shorter ones that are just a prefix of a kept longer one.
tpl = tpl.sort_values(['n_words','instances'], ascending=[False, False])
kept, seen = [], []
for r in tpl.itertuples():
    if any(s.startswith(r.stem + ' ') for s in seen):     # a longer template covers this
        continue
    kept.append(r); seen.append(r.stem)
tpl = pd.DataFrame(kept).drop(columns=['Index'], errors='ignore')

tpl['template'] = tpl.stem.str.strip() + ' [...]'
# Reusability: how many distinct creators, normalised — a stem used by 30 creators
# is a genuine pattern; one used by 3 is borderline.
tpl['reuse'] = (tpl.creators / tpl.creators.max()).round(3)
tpl['perf'] = (tpl.median_om.rank(pct=True)).round(3)
tpl['usability'] = (100 * (0.5*tpl.perf + 0.3*tpl.reuse
                    + 0.2*(tpl.instances.rank(pct=True)))).round(1)
tpl = tpl.sort_values('usability', ascending=False)
tpl[['template','intent','production','usability','instances','creators','categories',
     'median_om','median_views','example']].to_csv(
     os.path.join(D,'hook_templates.csv'), index=False, encoding='utf-8')

# ---------------------------------------------------------------- 5. PER-HOOK USABILITY
# Performance, adjusted for how cheap it is to shoot and whether it's reusable.
stem_reuse = dict(zip(tpl.stem, tpl.creators))
df['is_template'] = df.stem4.map(lambda s: s in stem_reuse).fillna(False)
df['usability'] = (100 * (
    0.55 * df.om.rank(pct=True)
  + 0.25 * df.is_template.astype(int)
  + 0.20 * (1 - (df.effort - 1) / 3))).round(1)
df['usability_band'] = pd.cut(df.usability, [0,40,60,80,100],
                              labels=['low','moderate','high','top'], include_lowest=True)

out_cols = ['hook','intent','production','funnel','effort','is_template','usability',
            'usability_band','archetype','tier','om','om_pct','views','words','word_band',
            'lang','main_category','subcategory','year','username','permalink']
out = df[out_cols].sort_values('usability', ascending=False).reset_index(drop=True)
out.to_csv(os.path.join(D,'hooks_by_usability.csv'), index=False, encoding='utf-8')

# ---------------------------------------------------------------- 6. REPORT
print("=== INTENT (what the video is trying to do) ===")
g = out.groupby('intent').agg(n=('hook','size'), median_om=('om','median'),
        median_views=('views','median'), med_words=('words','median'),
        pct_template=('is_template','mean'))
g['share_%'] = (100*g.n/len(out)).round(1); g['pct_template'] = (100*g.pct_template).round(1)
print(g.sort_values('median_om', ascending=False).round(2).to_string())

print("\n=== PRODUCTION (what you have to shoot) ===")
g = out.groupby('production').agg(n=('hook','size'), effort=('effort','first'),
        median_om=('om','median'), median_views=('views','median'))
g['share_%'] = (100*g.n/len(out)).round(1)
print(g.sort_values('median_om', ascending=False).round(2).to_string())

print("\n=== FUNNEL ===")
print(out.groupby('funnel').agg(n=('hook','size'), median_om=('om','median')).round(2).to_string())

print(f"\n=== TEMPLATES MINED: {len(tpl)} ===")
print("(stem recurring across >=5 hooks and >=3 different creators)")
for i in ['TEACH','SELL','PROVE','RELATE','PROVOKE','ENTERTAIN']:
    s = tpl[tpl.intent==i].head(6)
    if not len(s): continue
    print(f"\n  --- {i} ---")
    for r in s.itertuples():
        print(f"   {r.usability:5.1f} | {r.instances:3d} hooks / {r.creators:2d} creators | om {r.median_om:5.2f} | {r.template}")

print("\n=== USABILITY BANDS ===")
print(out.usability_band.value_counts().sort_index().to_string())

json.dump({
 'derived_from':'hooks_curated.csv (8,285 rows)','built':'2026-08-05',
 'axes':{
   'intent':'TEACH | SELL | RELATE | PROVOKE | PROVE | ENTERTAIN — the job the video does',
   'production':'TEXT_ON_BROLL | TALKING_HEAD | SKIT_OR_POV | SCREEN_DEMO | TRANSFORMATION',
   'funnel':'REACH | NURTURE | CONVERT','effort':'1 (cheapest) to 4 (most setup)'},
 'usability_score':'0.55*om_percentile + 0.25*is_template + 0.20*(1-effort_normalised)',
 'template_rule':'opening stem with >=5 instances across >=3 distinct creators',
 'templates_mined':int(len(tpl)),
 'intent_counts':out.intent.value_counts().to_dict(),
 'production_counts':out.production.value_counts().to_dict(),
 'caveats':[
   'Usability score is a design choice, not a measurement. Weights are editorial; re-weight for your users.',
   'Inherits every limit of the source corpus: winners-only, no control group, ~19mo stale, brand/app-marketing skew, no Nepali/Hindi.',
   'intent/production are rule-derived from text only — no video was watched. production is an inference from wording.'],
}, open(os.path.join(D,'usability_manifest.json'),'w',encoding='utf-8'), indent=2, ensure_ascii=False)
print("\nwrote -> hooks_by_usability.csv | hook_templates.csv | usability_manifest.json")
