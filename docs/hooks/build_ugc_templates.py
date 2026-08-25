"""Enrich the mined templates for the UGC-ads-for-brands use case, and emit
a self-contained JSON payload for the browsable page.

Adds per template: brand verticals it is proven in, a UGC-ad fit score, an
ad-angle label, and one cited real-world example (with permalink) as evidence.
"""
import sys, io, os, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, numpy as np

D = r'C:\baakhapaa\docs\hooks'
hooks = pd.read_csv(os.path.join(D, 'hooks_by_usability.csv'))
tpl   = pd.read_csv(os.path.join(D, 'hook_templates.csv'))

hooks['stem4'] = hooks.hook.fillna('').astype(object).map(
    lambda s: ' '.join(re.sub(r"[^\w\s']", ' ', s.lower()).split()[:4]) or None)
tpl['stem'] = tpl.template.str.replace(r'\s*\[\.\.\.\]$', '', regex=True)

# match each template back to its member hooks (stem may be 3,4 or 5 words)
def members(stem):
    n = len(stem.split())
    key = hooks.hook.fillna('').astype(object).map(
        lambda s: ' '.join(re.sub(r"[^\w\s']", ' ', s.lower()).split()[:n]))
    return hooks[key == stem]

# ---- ad angle: how a brand would brief this -----------------------------
ANGLE = {
 'TEACH':     'Educational / how-to',
 'SELL':      'Direct product push',
 'PROVE':     'Proof & testimonial',
 'RELATE':    'Relatable / native feel',
 'PROVOKE':   'Scroll-stopper',
 'ENTERTAIN': 'Entertainment-led',
}
# How well each intent serves a paid UGC brand ad. TikTok's own data says
# native-feeling creative drives 3.3x more actions, so RELATE scores well
# despite weaker organic lift; pure ENTERTAIN converts worst.
AD_FIT_INTENT = {'PROVE':1.00, 'SELL':0.95, 'TEACH':0.90, 'RELATE':0.80,
                 'PROVOKE':0.60, 'ENTERTAIN':0.45}
# Formats a brand can realistically brief to a UGC creator, cheaply.
AD_FIT_PROD = {'TALKING_HEAD':1.00, 'SCREEN_DEMO':0.90, 'TEXT_ON_BROLL':0.85,
               'TRANSFORMATION':0.80, 'SKIT_OR_POV':0.70}

recs = []
for r in tpl.itertuples():
    m = members(r.stem)
    if not len(m):
        continue
    verticals = m.main_category.value_counts()
    subs = m.subcategory.value_counts()
    ex = m.nlargest(1, 'om').iloc[0]
    fit = (0.40 * AD_FIT_INTENT.get(r.intent, .5)
         + 0.20 * AD_FIT_PROD.get(r.production, .5)
         + 0.25 * min(r.creators / 20, 1.0)          # cross-creator proof
         + 0.15 * min(len(verticals) / 6, 1.0))      # cross-vertical proof
    recs.append({
        'template': r.template,
        'stem': r.stem,
        'intent': r.intent,
        'angle': ANGLE.get(r.intent, r.intent),
        'production': r.production,
        'effort': int(m.effort.median()),
        'funnel': m.funnel.mode().iat[0],
        'usability': round(float(r.usability), 1),
        'adFit': round(100 * fit, 1),
        'instances': int(r.instances),
        'creators': int(r.creators),
        'medianOm': round(float(r.median_om), 2),
        'medianViews': int(r.median_views),
        'verticals': [{'name': k, 'n': int(v)} for k, v in verticals.head(4).items()],
        'niches': [k for k in subs.head(3).index.tolist()],
        'example': {'text': str(ex.hook)[:150], 'url': str(ex.permalink),
                    'om': round(float(ex.om), 1), 'views': int(ex.views)},
        'confidence': 'solid' if r.instances >= 10 else 'indicative',
    })

recs.sort(key=lambda d: -d['adFit'])
payload = {
    'built': '2026-08-05',
    'source': 'benxh/tiktok-hooks-finetune (MIT) -> 8,285 curated hooks -> 126 templates',
    'n': len(recs),
    'templates': recs,
}
with open(os.path.join(D, 'ugc_templates.json'), 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))

print(f"templates: {len(recs)}")
print(f"payload KB: {os.path.getsize(os.path.join(D,'ugc_templates.json'))/1024:.1f}")
print("\nintents:", pd.Series([r['intent'] for r in recs]).value_counts().to_dict())
print("confidence:", pd.Series([r['confidence'] for r in recs]).value_counts().to_dict())
print("\n=== TOP 12 BY UGC AD FIT ===")
for r in recs[:12]:
    print(f"  {r['adFit']:5.1f} | {r['angle']:22s} | {r['creators']:2d} creators | "
          f"{len(r['verticals'])} verticals | {r['template']}")
