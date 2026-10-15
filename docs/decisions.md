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

## Architecture (Phase 1, approved 2026-10-15)

Full detail in `docs/architecture.md`.

- Web app on Vercel (existing Pro plan), built to move: no Vercel-only services, outside services behind interfaces, weekly OpenNext portability build.
- Redirects on Cloudflare (Worker + KV + Analytics Engine) on `qrfinity.link`, in a separate Cloudflare account. Competitors also isolate redirects on short domains (QR Code Generator PRO: `qrco.de`, `l.ead.me`; QR TIGER: `qr1.be`).
- Postgres on Neon instead of D1, because D1 is only practical from inside Cloudflare.
- Better Auth + Resend. Dashboard at `qrfinity.com/dashboard`.
- KV only on the hot path at launch: edits usually live instantly, up to about a minute where a code was just scanned. Competitors advertise "instant" edits.
- DNS: `qrfinity.com` and `qrfinity.ca` stay on Hostinger; `qrfinity.link` nameservers move to Cloudflare in Phase 3.
- Revised cost: Cloudflare ~$5/month up to 10M scans, ~$48 at 50M (the earlier ~$30 left out KV reads).

## Generator (Phase 2, October 2026)

- **Own renderer instead of `qr-code-styling`.** We need frames, vector PDF and EPS, and identical output in every format; `qr-code-styling` has no frames, PDF or EPS and renders through its own canvas/SVG paths. Ours uses `uqr` (a port of Nayuki's reference encoder) for the matrix and draws one format-neutral scene that SVG and EPS writers serialise. PNG/JPG rasterise the SVG; PDF converts the SVG with jsPDF + svg2pdf (vector, Helvetica text, embedded logo).
- **EPS is feasible and shipped**: Level 3 PostScript with vector paths, gradient shadings and the logo as an RGB image composited onto the background (EPS has no simple alpha). Verified by rendering in Ghostscript and decoding.
- **Scan check uses zxing-cpp (`zxing-wasm`)**, the decoder family closest to what phones use, in a Web Worker; the wasm is self-hosted. jsQR was rejected: weaker on stylised codes, unmaintained since 2020. On top of the decode, design rules fail low contrast (< 3:1) and warn on inverted colours, transparency, large logos, tiny margins, dense data and print sizes below 0.4 mm per module (2 cm minimum).
- **Frame text is Helvetica Bold / Arial**, not our brand fonts: it renders the same in PNG, SVG, PDF and EPS, and print shops already have it. Non-Latin-1 characters in frame text become "?" in EPS only.
- **Location codes link to Google Maps** (`geo:` URIs don't open from the iPhone camera). **App store codes hold one store link**: device-based routing needs a dynamic code.

## Monetization (later)

- Competitors gate by number of dynamic codes (Uniqode $5/mo for 3 codes up to $99; QR TIGER from $7/mo; QR Code Generator PRO Professional: 250 codes). We give codes away and charge for professional features.
- Free forever: unlimited static + dynamic, full design, all formats, 90-day analytics.
- Pro (~$6–9/mo, monthly billing): full analytics history, custom short domain, bulk CSV, smart redirects, password protection, UTM, pixels.
- Business (~$19–49/mo): seats, client workspaces, API, white-label, hosted landing pages.
- Extras: "print your QR code as stickers or magnets" link to Craftigure; "need a campaign built?" link to Teknoffice. No ads on the generator, dashboard or redirects.
- Rule: never move an existing free feature behind the paywall; never deactivate a code.

## Name and domains

- Chosen: **QRfinity** (QR + infinity). Rejected: QRLasts (sounds like "QR Last"; qrlast.com belongs to someone else), QRVow (sounds like "QR Wow"), QRLasting (clear but forgettable), InfiniQR (spelling risk).
- Domains, all available as of 2026-10-15 at ~$11/yr (.com) and $7/yr (.link): **qrfinity.com** (site), **qrfinity.link** (redirects only, isolated for abuse), **qrfinity.ca** (protect the name). Registered by Kashan on 2026-10-15.
- Trademark check (2026-10-15): exact-name searches for "QRfinity" returned 0 results on USPTO (wordmark, live and dead) and on CIPO (all fields). This was a knock-out search only; it does not cover similar-sounding marks (e.g. Comcast's Xfinity, "QR Infinity"). Consider a trademark agent's clearance search and filing before heavy marketing.
- Known risk: people may type qrinfinity.com (owned by someone else).
- Logo: Kashan confirmed he holds the rights to the reference drawing the mark is traced from.

## Brand

See `brand/BRAND.md`. Evergreen + paper + one yellow spark; Bricolage Grotesque for headlines, Manrope for text, JetBrains Mono for short links; the mark spells QR as one woven infinity ribbon (traced from the approved reference drawing: open Q loop, R with straight bar and separate leg, cuts square to each strand), with "finity" in Bricolage 800 set tight against it and yellow i-dots.
