"""Curate benxh/tiktok-hooks-finetune into a clean, archetype-labelled hook corpus.

KEY FINDING driving this pipeline: `text_hook` is OCR'd on-screen text from the
opening frame, NOT an authored hook field. So the dominant curation problem is
junk removal (OCR failure strings, app UI chrome, brand wordmarks, fragments),
not classification.

Source: https://huggingface.co/datasets/benxh/tiktok-hooks-finetune (MIT)
"""
import sys, io, glob, json, re, os, unicodedata
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, numpy as np

SRC = glob.glob(r'C:\Users\User\AppData\Local\Temp\claude\C--baakhapaa\5b1f8b9c-32c4-4f9a-a475-38fe0b0a364f\scratchpad\hf\**\sharegpt_conversations.parquet', recursive=True)[0]
OUT = r'C:\baakhapaa\docs\hooks'
os.makedirs(OUT, exist_ok=True)

df = pd.read_parquet(SRC, columns=['username','main_category','subcategory','text_hook','views',
    'likes','comments','shares','outlier_multiplier','uploaded_at','ad_link','text_hook_lang'])
df = df.rename(columns={'ad_link':'permalink','text_hook_lang':'lang','outlier_multiplier':'om'})
n0 = len(df); audit = []

df['hook'] = (df.text_hook.fillna('').astype(str)
              .map(lambda s: unicodedata.normalize('NFKC', s))
              .str.replace(r'\s+', ' ', regex=True).str.strip())
df['words'] = df.hook.str.split().str.len()

def drop(mask, label):
    global df
    k = int(mask.sum()); df = df[~mask].copy(); audit.append((label, -k))

# ---- structural cleaning -------------------------------------------------
drop(df.hook.str.len() == 0,                                  'empty')
drop(df.words > 26,                                           '>26 words (caption/transcript, not a hook)')
drop(df.hook.str.startswith('#') | df.hook.str.count('#').ge(3), 'hashtag-led / hashtag spam')
drop(~df.hook.str.contains('[A-Za-z]', regex=True, na=False), 'no latin letters')
drop(df.om.isna() | (df.om < 1.0),                            'om missing or <1')
drop(df.views < 1000,                                         '<1k views')

# ---- junk removal (the big one) -----------------------------------------
OCR_FAIL = re.compile(r"(there (is|are) no (text|emoji)|image (is blank|does not contain)|"
                      r"no text (or emojis? )?(is |are )?(present|visible|in the image)|"
                      r"^\s*(n/?a|none|null|blank|unknown)\s*$)", re.I)
drop(df.hook.str.contains(OCR_FAIL, na=False), 'OCR-failure string')

# App/device UI chrome: runs of Title-Case or ALLCAPS nouns with no function words.
FUNC = re.compile(r"\b(the|a|an|is|are|was|were|be|been|am|do|does|did|have|has|had|will|would|"
                  r"can|could|should|my|your|his|her|their|our|its|i|you|he|she|we|they|it|me|him|us|them|"
                  r"this|that|these|those|to|of|in|on|for|with|but|because|if|when|how|what|why|who|not|no|"
                  r"don'?t|didn'?t|isn'?t|can'?t|just|so|and|or|about|from|like|get|got|make|made|"
                  r"want|need|know|think|say|said|tell|told|see|saw|look|feel|felt|try|use)\b", re.I)
UI_WORDS = re.compile(r"\b(settings|filters|trim|beatsync|facetrack|show all|trending|themes|"
                      r"wallpapers|subscribe|premium|upgrade|download|home|profile|inbox|search|"
                      r"library|playlist|dashboard|notifications|am|pm|hour|min|sec|scanning|loading)\b", re.I)
has_func = df.hook.str.contains(FUNC, na=False)
ui_chrome = (~has_func) & (df.words >= 2) & df.hook.str.contains(UI_WORDS, na=False)
drop(ui_chrome, 'app UI chrome')

# Fragments / label soup: multi-word, zero function words, not a short punchy line.
drop((~has_func) & (df.words >= 4), 'no function words (label soup / OCR fragment)')

# Mid-sentence fragments: starts lowercase AND ends without terminal punctuation,
# while being long enough that it should have had structure.
frag = (df.hook.str[0].str.islower().fillna(False)
        & ~df.hook.str.contains(r'[.!?:]$', na=False) & (df.words >= 8))
drop(frag, 'mid-sentence fragment')

# Brand-wordmark-only: 1-2 tokens, no function words, no verb-ish content.
drop((~has_func) & (df.words <= 3) & ~df.hook.str.contains(r'[.!?:]', na=False),
     'brand wordmark / bare label')

# Truncated tail: ends on a dangling function word ("Dumb ways to", "up my app the morning").
DANGLE = re.compile(r"\b(to|the|a|an|and|or|of|in|on|for|with|my|your|his|her|their|our|is|are|"
                    r"was|were|be|that|this|but|because|if|when|how|what|i|you|we|they|it|at|as)\s*$", re.I)
drop(df.hook.str.contains(DANGLE, na=False), 'truncated tail (dangling function word)')

# Residual UI/device label soup: >=4 tokens, mostly Capitalised nouns, no sentence punctuation,
# and a low ratio of function words (catches "Not Frequent Calculator Calendar Contacts ...").
tok = df.hook.str.split()
func_ratio = df.hook.str.count(FUNC) / df.words.clip(lower=1)
cap_ratio = tok.map(lambda t: sum(w[:1].isupper() for w in t) / max(len(t), 1))
drop((df.words >= 4) & (func_ratio < 0.2) & (cap_ratio > 0.6)
     & ~df.hook.str.contains(r'[.!?]', na=False), 'device/app label soup')

# Very short ALLCAPS with no punctuation — OCR'd on-screen labels ("IT'S", "MUSCLE IS").
drop((df.words <= 3) & (df.hook == df.hook.str.upper())
     & ~df.hook.str.contains(r'[.!?]', na=False), 'short ALLCAPS label')

# ---- dedupe + creator cap -----------------------------------------------
df['_key'] = df.hook.str.lower().str.replace(r'[^\w\s]', '', regex=True).str.strip()
b = len(df); df = df.sort_values('om', ascending=False).drop_duplicates('_key', keep='first')
audit.append(('duplicate hook text', -(b - len(df))))
b = len(df); df = df.groupby('username', group_keys=False).head(60)
audit.append(('creator cap (60/creator)', -(b - len(df))))

# ---- archetype labelling -------------------------------------------------
R = [
 ('pov_realism',      r"^\s*(pov\b|p\.o\.v|me when\b|me:|when (you|i|he|she|they|the|your|my)\b|that moment when\b|nobody:|everyone else:)"),
 ('contrarian',       r"\b(unpopular opinion|hot take|controversial|nobody (is |will |ever )?(going to )?tells? you|no one talks about|you'?(re| are) (doing|using|eating|saying) .{0,30}wrong|i was wrong about|stop (buying|believing|falling)|don'?t (buy|believe|fall for)|(it'?s|its) not .{0,25}it'?s)\b"),
 ('outcome_proof',    r"\b(how i |i (made|lost|got|went from|grew|built|saved|earned|quit|tried)|from \$?[\d,]+ ?(to|→)|in (just )?\d+ ?(days?|weeks?|months?|years?|minutes?)|results? after|before ?(and|&|/|\|)? ?after|\d+ ?(k|m|lbs|kg|%|x)\b|day \d+ of)"),
 ('listicle',         r"^\s*\d+\s+\w+|\b\d+ (things|ways|reasons|tips|mistakes|signs|steps|hacks|secrets|rules|habits|apps|tools|places|foods)\b|\b(top|best|worst) \d+\b|^\s*(best|top|worst) .{0,40}\b(for|to|in|of)\b"),
 ('demonstration',    r"\b(what .{0,30}looks? like|how to |here'?s how|watch (me|this|how)|let me show|tutorial|step by step|the final (look|result)|check the results?)\b"),
 ('curiosity_gap',    r"\b(the (secret|trick|reason|truth|one thing|real reason|only way)|here'?s (why|what)|what (happened|nobody|they don'?t)|you won'?t believe|wait (for it|until|till)|this is why|turns out|guess what|it started with)\b"),
 ('question',         r"^\s*(what|why|how|who|when|where|which|do|does|did|is|are|can|could|would|should|have|has|will|ever|anyone|am i|are you|did you)\b|\?\s*$"),
 ('problem_solution', r"\b(struggling with|tired of|sick of|if you (have|are|keep|can'?t|struggle|hate)|stop (wasting|struggling|doing)|the fix for|try this instead|here'?s the fix|problem with|avoid (these|this))\b"),
 ('authority',        r"\b(as an? [a-z]+,|i'?m an? [a-z]+ (and|with|who)|after \d+ years|\d+ years? (of|as)|dermatologist|doctor|lawyer|engineer|nurse|therapist|dietitian|certified|licensed)\b"),
 ('comparative',      r"\b(vs\.?|versus|compared to|better than|worse than|instead of|which (is|one)) \b"),
 ('quote_dialogue',   r'^\s*["\u201c\u2018\'].{4,}["\u201d\u2019\']\s*[.!?]?\s*$|\b(he|she|they|mom|dad|my boss|the doctor) (said|told me|asked)\b'),
 ('direct_address',   r"^\s*(you|your|if you|listen|hey|attention|calling all|to (everyone|anyone|all)|for (everyone|anyone|those|all) who|this is (for|your))\b"),
 ('story_teaser',     r"^\s*(so |ok(ay)? so |story ?time|i just|last (night|week|year|month)|yesterday|a few (days|weeks|months|years) ago|the other day|it all started)\b"),
 ('imperative',       r"^\s*(stop|start|don'?t|never|always|watch|look|listen|try|use|read|save|remember|check|meet|introducing|say goodbye|get)\b"),
 ('shock_statement',  r"\b(insane|crazy|shocking|wild|unbelievable|nobody expected|changed everything|obsessed|literally (crying|screaming|shaking))\b|[!]{2,}"),
 ('product_showcase', r"\b(this app|this tool|found (a|this|the)|new favou?rite|obsessed with|i found|check out this|the app that)\b"),
 ('benefit_promise',  r"\b(turn (any|your) .{0,30}into|in (under |just |less than )?\d+ (minutes?|seconds?|days?)|without (any|the|having|ever)|the (easiest|fastest|simplest|only) way|never .{0,25}again|so you (don'?t|never)|for free)\b"),
 ('relatable_identity', r"^\s*(people who|for (people|those|everyone|anyone|girls|guys|moms|dads|students)|everyone who|that one|us\b|we all)\b|\b(if you know,? you know|iykyk)\b"),
 ('reveal_tease',     r"\b(they think .{0,30}but|but (wait|then|actually)|until i|no one knows|little did|plot twist|and then this happened)\b|\.\.\.\s*$"),
 ('warning_mistake',  r"\b(warning|red flags?|biggest mistake|worst thing|never (do|buy|say|use)|you should never|things? (not to|to avoid)|don'?t make this)\b"),
 ('invitation',       r"^\s*(come |let'?s |join |grab |get your|try )|\b(with me|together)\s*[!.]?\s*$"),
]
COMPILED = [(n, re.compile(p, re.I)) for n, p in R]
df['archetype'] = df.hook.map(lambda h: next((n for n, rx in COMPILED if rx.search(h)), 'other'))

# ---- scoring -------------------------------------------------------------
df['om_pct'] = df.om.rank(pct=True).round(4)
df['tier'] = pd.cut(df.om_pct, [0,.5,.8,.95,1.0], labels=['baseline','strong','high','exceptional'], include_lowest=True)
df['word_band'] = pd.cut(df.words, [0,2,5,10,26], labels=['0-2','3-5','6-10','11-26'], include_lowest=True)
df['year'] = pd.to_datetime(df.uploaded_at, errors='coerce', format='mixed', utc=True).dt.year

cols = ['hook','archetype','tier','om','om_pct','views','likes','comments','shares','words',
        'word_band','lang','main_category','subcategory','year','username','permalink']
allrows = df[cols].sort_values(['archetype','om_pct'], ascending=[True,False]).reset_index(drop=True)

# CURATED CORE = rows that matched a named archetype. Everything left in `other`
# still contains residual OCR noise, so it ships separately as a review queue
# rather than being passed off as curated.
out = allrows[allrows.archetype != 'other'].reset_index(drop=True)
queue = allrows[allrows.archetype == 'other'].reset_index(drop=True)
out.to_csv(os.path.join(OUT,'hooks_curated.csv'), index=False, encoding='utf-8')
queue.to_csv(os.path.join(OUT,'hooks_review_queue.csv'), index=False, encoding='utf-8')
eng = out[out.lang=='en']; eng.to_csv(os.path.join(OUT,'hooks_curated_en.csv'), index=False, encoding='utf-8')
print(f"\n=== SPLIT ===\n  curated core (archetype matched): {len(out):,}\n  review queue (unmatched 'other'): {len(queue):,}")

# ---- report --------------------------------------------------------------
print("=== PIPELINE AUDIT ===")
run = n0; print(f"  {'raw rows':44s} {n0:>7,}")
for k,v in audit:
    run += v; print(f"  drop: {k:38s} {v:>7,}   -> {run:,}")
print(f"\n  {'CURATED TOTAL':44s} {len(out):>7,}   (english {len(eng):,})")
print(f"  {'retention from raw':44s} {100*len(out)/n0:>6.1f}%")

print("\n=== ARCHETYPE DISTRIBUTION ===")
g = out.groupby('archetype').agg(n=('hook','size'), median_om=('om','median'),
                                 median_views=('views','median'), med_words=('words','median'))
g['share_%'] = (100*g.n/len(out)).round(1)
print(g.sort_values('median_om', ascending=False).round(2).to_string())

print("\n=== HOOK LENGTH vs PERFORMANCE (replicating Content Labs) ===")
print(out.groupby('word_band', observed=True).agg(n=('hook','size'), median_om=('om','median'),
      median_views=('views','median')).round(2).to_string())

print("\n=== CATEGORY COVERAGE (top 12) ===")
print(out.main_category.value_counts().head(12).to_string())

json.dump({
 'source':{'dataset':'benxh/tiktok-hooks-finetune','url':'https://huggingface.co/datasets/benxh/tiktok-hooks-finetune',
           'license':'MIT','file':'sharegpt_conversations.parquet','size_bytes':36150270},
 'curated_at':'2026-08-05','rows_raw':n0,'rows_curated':len(out),'rows_curated_en':len(eng),
 'score_field':'om = outlier_multiplier = views / creator baseline views (creator-relative, NOT raw views)',
 'critical_findings':[
   'text_hook is OCR-extracted on-screen text from the opening frame, NOT an authored hook field. ~half of raw rows are UI chrome, brand wordmarks, OCR-failure strings or fragments.',
   'Winners-only corpus: 99% of raw rows have om>=1.36, median 3.98x. No control group — cannot support causal "archetype X beats Y" claims.',
   'outlier_multiplier is creator-relative but its exact baseline is not reconstructable from the shipped columns (best fit views/creator_min at ratio 1.51, tight IQR).',
   'Content is 923 brand/app-marketing accounts under an app-store category taxonomy, not general organic creators.',
   'Upload dates 2019-09-30 to 2025-01-26; ~19 months stale at curation date.',
   'Archetype labels are regex-derived and not human-validated.'],
 'archetype_counts': out.archetype.value_counts().to_dict(),
 'lang_counts': out.lang.value_counts().head(15).to_dict(),
}, open(os.path.join(OUT,'hooks_manifest.json'),'w',encoding='utf-8'), indent=2, ensure_ascii=False)
print("\nwrote -> hooks_curated.csv | hooks_curated_en.csv | hooks_manifest.json")
