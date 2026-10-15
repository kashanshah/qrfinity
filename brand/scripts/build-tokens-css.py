#!/usr/bin/env python3
"""Compile brand/tokens.json into brand/tokens.css.
Usage: python3 brand/scripts/build-tokens-css.py brand/tokens.json ./fonts/ > brand/tokens.css
"""
import json,sys
t=json.load(open(sys.argv[1])); fontdir=sys.argv[2]
th=[x['id'] for x in t['color']['themes']]
def v(tok,theme):
    x=tok['value']; return x if isinstance(x,str) else x.get(theme,x[th[0]])
out=["/* QRfinity — generated from tokens.json by brand/scripts/build-tokens-css.py. Do not edit by hand. */"]
for f in t['type']['fonts']:
    out.append(f"@font-face {{ font-family: \"{f['family']}\"; src: url(\"{fontdir}{f['file'].split('/')[-1]}\") format(\"woff2\"); font-weight: {f['weight']}; font-style: normal; font-display: swap; }}")
for i,theme in enumerate(th):
    sel=':root, [data-theme="light"]' if i==0 else f'[data-theme="{theme}"]'
    lines=[f"  --{c['name']}: {v(c,theme)};" for c in t['color']['tokens']]+[f"  --{c['name']}: {v(c,theme)};" for c in t['shadow']['tokens']]
    out.append(sel+" {\n"+"\n".join(lines)+"\n}")
dark_auto="@media (prefers-color-scheme: dark) {\n  :root:not([data-theme=\"light\"]) {\n"+"\n".join(f"    --{c['name']}: {v(c,'dark')};" for c in t['color']['tokens']+t['shadow']['tokens'])+"\n  }\n}"
out.append(dark_auto)
root=[f"  --{s['name']}: {s['value']};" for s in t['spacing']['tokens']+t['radius']['tokens']]+[f"  --font-{k}: {val};" for k,val in t['type']['families'].items()]
out.append(":root {\n"+"\n".join(root)+"\n}")
for g in t['type']['groups']:
    for s in g['styles']:
        fam=s.get('family',g['family'])
        props=[f"font-family: var(--font-{fam})",f"font-size: {s['fontSize']}",f"line-height: {s['lineHeight']}",f"font-weight: {s['fontWeight']}"]
        if 'letterSpacing' in s: props.append(f"letter-spacing: {s['letterSpacing']}")
        out.append(f".{s['name']} {{ "+"; ".join(props)+"; }")
print("\n\n".join(out))
