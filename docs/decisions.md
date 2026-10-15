# Decisions and research so far

Summary of the planning conversation (October 2026) that led to this repo. Read this before proposing changes to scope, positioning or pricing.

## Why a QR code generator

- It is one of several free tools built as organic traffic magnets, alongside 3D Box Studio (3dboxstudio.com) and its dieline generator.
- Demand is huge and the market leaders are disliked. Many "free" generators make **dynamic** codes that are deactivated after a 7–14 day trial, after people have printed them. qr-code-generator.com (QR Code Generator PRO) has thousands of 1.5-star Trustpilot reviews about this; QRFY and QR.io draw similar complaints.
- Our wedge: **free dynamic codes with analytics that never expire**, plus unlimited static codes, no watermark, every format free.

## Can we rank?

- Not for the head term "qr code generator" in year one. Page one is held by sites with authority 43–69 and millions of monthly visits (me-qr.com ~30M, qr-code-generator.com ~7M, qrfy.com ~2.8M, qr.io ~1.7M).
- Realistic path: many use-case pages (WiFi, vCard, with logo, Google review, menu, Amazon review…), "no expiration" and "stopped working" pages, alternatives pages, and multilingual pages later. The ME-QR case study grew mostly through use-case generator pages.
- AI answers (ChatGPT, Gemini, Perplexity) may be faster than Google. They cite listicles, Reddit, YouTube and LinkedIn. Plan: get into the 10–15 most-cited "best free QR code generator" listicles, answer Reddit threads about expired codes honestly, list on Product Hunt, AlternativeTo, Capterra and G2.
- Keyword-stuffed domains were rejected: exact-match domains carry little weight, and AI answers recommend brands.

## Cost

- Static generation runs in the browser: near zero.
- Dynamic redirects + analytics on Cloudflare: Workers Paid is $5/month with 10M requests included, then $0.30 per million; Analytics Engine includes 10M data points, then $0.25 per million. Estimate: ~$5/month up to 10M scans, ~$30 at 50M, ~$60 at 100M.
- Budget for URL-reputation screening (abuse protection) from day one.

## Monetization (later)

- Competitors gate by number of dynamic codes (Uniqode $5/mo for 3 codes up to $99; QR TIGER from $7/mo; QR Code Generator PRO Professional: 250 codes). We give codes away and charge for professional features.
- Free forever: unlimited static + dynamic, full design, all formats, 90-day analytics.
- Pro (~$6–9/mo, monthly billing): full analytics history, custom short domain, bulk CSV, smart redirects, password protection, UTM, pixels.
- Business (~$19–49/mo): seats, client workspaces, API, white-label, hosted landing pages.
- Extras: "print your QR code as stickers or magnets" link to Craftigure; "need a campaign built?" link to Teknoffice. No ads on the generator, dashboard or redirects.
- Rule: never move an existing free feature behind the paywall; never deactivate a code.

## Name and domains

- Chosen: **QRfinity** (QR + infinity). Rejected: QRLasts (sounds like "QR Last"; qrlast.com belongs to someone else), QRVow (sounds like "QR Wow"), QRLasting (clear but forgettable), InfiniQR (spelling risk).
- Domains, all available as of 2026-10-15 at ~$11/yr (.com) and $7/yr (.link): **qrfinity.com** (site), **qrfinity.link** (redirects only, isolated for abuse), **qrfinity.ca** (protect the name). Not yet registered.
- Known risks: people may type qrinfinity.com (owned by someone else); the name rhymes with Comcast's Xfinity. Run a trademark search (CIPO, USPTO) before launch.

## Brand

See `brand/BRAND.md`. Evergreen + paper + one yellow spark; Bricolage Grotesque for headlines, Manrope for text, JetBrains Mono for short links; the mark spells QR as one woven infinity ribbon (Q = full circle, R's bowl = second loop) with flat-cut tail and leg; "finity" follows in Bricolage 800 with yellow i-dots.
