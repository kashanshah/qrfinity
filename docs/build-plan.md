# QRfinity build plan: free QR code generator (codes that never expire)

> Work in phases. Stop at the end of each phase, summarize what changed, and wait for my OK.

---

## 0. Context and goal

We are building a free QR code generator as an organic traffic magnet, competing with qr-code-generator.com, QR TIGER, Uniqode, QRFY and QRCode Monkey.

The market problem we are solving: many "free" generators create **dynamic** codes that are deactivated after a 7–14 day trial, after people have already printed them. Users are angry about this (Trustpilot, Reddit).

**Our promise (the whole product depends on it):**
- Static codes: free, unlimited, no sign-up, never expire.
- Dynamic codes: free, unlimited, with scan analytics, and **they never stop working**. A free account is required only so the owner can edit the destination.
- No watermark, no forced branding, all export formats free.
- We will never move an existing free feature behind a paywall. Paid plans only add new capabilities.

Put this promise in plain words on the homepage, pricing page and terms.

---

## Phase 1: Architecture proposal (no code yet)

Propose and get my approval on:

- **Stack:** Next.js (App Router) + TypeScript + Tailwind + Zustand (my usual stack). Marketing and SEO pages statically generated.
- **Hosting:** Cloudflare is preferred for cost (Workers Paid is $5/month with 10M requests included). Options: Next.js on Cloudflare via OpenNext, or the Next.js app on Vercel with only the redirect service on Cloudflare. Recommend one with reasons.
- **Redirect service:** a separate Cloudflare Worker on `qrfinity.link`. It must be isolated from `qrfinity.com` so that if abuse ever gets the short domain flagged, the main site's SEO is unaffected.
- **Data:**
  - D1 (or Postgres if you argue for it) for users, codes, destinations, edit history.
  - Workers KV for the slug → destination lookup on the hot path.
  - Workers Analytics Engine for scan events (10M data points included on Workers Paid; data retained 90 days, which also defines the free analytics window).
  - R2 for any uploaded logos (Pro later: hosted PDFs/menus).
- **Auth:** passwordless email magic link plus Google sign-in. Suggest a library that works on the chosen runtime (e.g. Better Auth or Auth.js). Cloudflare Turnstile on sign-up.
- **Email:** transactional provider with a free tier.
- Estimated monthly cost at 1M, 10M and 50M scans.

**Wait for approval.**

---

## Phase 2: Static generator (no account, fully client-side)

Homepage = the generator. It must load fast and work without sign-up.

### Content types
URL, Text, Wi-Fi, vCard (contact), Email, SMS, Phone, WhatsApp, Location (maps), Calendar event, App store links (iOS/Android), Social profile link.

### Design options (all free)
- Dot styles, corner (eye) frame and eye-ball styles.
- Foreground/background colours, gradients, transparent background.
- Logo upload (processed locally in the browser), logo size and margin, auto "clear area" behind logo.
- Frames with call-to-action text ("Scan me", "Menu", "Review us") and editable text/colour.
- Error-correction level (auto-raise to H when a logo is used).
- Size and quiet-zone controls.
- Save design as a reusable template (localStorage for anonymous users, account later).

Use a well-maintained library such as `qr-code-styling` (or justify an alternative).

### Exports (all free)
PNG (selectable resolution up to print size), SVG, PDF (vector), EPS if feasible (otherwise explain), JPG. Batch download zip for multiple sizes.

### Scannability check (differentiator)
After every change, decode the rendered code in the browser (e.g. zxing-js or jsQR) and show a pass/fail "Scan check" badge, plus warnings for low contrast, inverted colours, logo too large, or too small for the chosen print size. Show a minimum print size recommendation.

### Static vs dynamic clarity
Every code clearly shows whether it is **Static** (encodes the destination directly; works forever; not editable or trackable) or **Dynamic** (editable and trackable; free with an account; never deactivated). Never create a dynamic code silently.

**Stop and report.**

---

## Phase 3: Accounts and dynamic codes

- Sign-up/login (magic link, Google). Turnstile protection. No credit card ever required.
- Dashboard: list of codes, search, folders/tags, duplicate, edit destination, edit design, download, pause (owner-initiated only), delete.
- Dynamic code = short URL `https://qrfinity.link/{slug}` (6–8 char random base62 slug, collision-checked).
- Edit history for destination changes.
- Unlimited dynamic codes on free accounts. Add sensible anti-abuse rate limits (codes created per hour/day per account) that a normal business never hits.
- Export all of the user's code data (CSV/JSON).

### Redirect Worker (hot path)
- Look up slug in KV (fall back to D1, then repopulate KV).
- Respond with a 302 redirect (destinations are editable, so not 301).
- Write one Analytics Engine data point per scan: code id, timestamp, country (from Cloudflare request data), city/region if available, device type, OS, browser (parsed UA), referer. **Do not store raw IP addresses**; if uniqueness is needed, use a daily-rotating salted hash.
- Target p95 latency under 50 ms. No interstitial pages, no ads on redirects.
- Unknown slug → friendly 404 page on the short domain.
- Disabled-for-abuse slug → neutral warning page, never the original destination.

### Analytics dashboard (free)
Last 90 days: total and unique scans, time series (day/week), top countries and cities, device/OS/browser, scans by hour. Per-code and account-wide views. CSV export of what's displayed.

**Stop and report.**

---

## Phase 4: Abuse and trust (required before public launch)

Free dynamic redirects attract phishing. Build this before launch, not after:

- Check every destination on create and edit against a URL-reputation service (Google Web Risk or Safe Browsing; confirm licensing for commercial use and tell me the cost), plus our own blocklist.
- Block destinations that are raw IPs, other URL shorteners, `data:`/`javascript:` URLs, and known-bad TLD patterns (configurable).
- Periodic re-check of all active destinations (scheduled Worker).
- "Report this QR code" link in the footer of the short-domain 404/warning pages and on the main site; admin queue to review and disable codes.
- Admin panel: search codes/users, disable a code, suspend a user, view audit log.
- Rate limits on sign-up, creation and edits. Turnstile on sign-up.
- Terms of service, acceptable use policy, privacy policy (scan analytics, no raw IP storage, cookie usage), and the "never expire" promise written into the terms. Mark these as drafts for my legal review.

**Stop and report.**

---

## Phase 5: SEO pages

All marketing pages statically generated, content visible without JavaScript. Target mobile LCP < 2.5 s, CLS < 0.1.

### 5.1 URL structure

```
/                                        Free QR Code Generator (tool + promise + FAQ)
/qr-code-generator/url
/qr-code-generator/wifi
/qr-code-generator/vcard
/qr-code-generator/with-logo
/qr-code-generator/google-review
/qr-code-generator/instagram
/qr-code-generator/whatsapp
/qr-code-generator/pdf                   (static: link to an already hosted PDF; hosted PDFs are Pro later)
/qr-code-generator/menu
/qr-code-generator/business-card
/qr-code-generator/email
/qr-code-generator/sms
/qr-code-generator/location
/qr-code-generator/event
/qr-code-generator/app-store
/qr-code-generator/youtube
/qr-code-generator/spotify
/qr-code-generator/payment-link
/qr-code-generator/amazon-review        (for Amazon sellers; product insert cards)
/qr-code-generator/bulk                  (Pro teaser, waitlist)
/dynamic-qr-code-generator               free dynamic codes that never expire
/qr-code-no-expiration
/qr-code-stopped-working                 diagnosis + fix guide (high intent: people burned by trials)
/guides/static-vs-dynamic-qr-codes
/guides/do-qr-codes-expire
/guides/qr-code-size-for-print
/guides/how-to-track-qr-code-scans
/guides/qr-code-design-best-practices
/guides/how-to-print-qr-codes-on-packaging
/alternatives/qr-code-generator-pro
/alternatives/qr-tiger
/alternatives/qrfy
/alternatives/uniqode
/alternatives/qrcode-monkey
/pricing                                 Free plan in full; Pro "coming soon" with waitlist
```

### 5.2 Use-case page template
1. H1 "Free [Type] QR Code Generator", one-line promise.
2. Generator preloaded with that content type.
3. What it does / when to use it (short, specific).
4. Step-by-step (3–5 steps) with screenshots generated from our own tool.
5. Design and print tips specific to this use case (sizes, placement, CTA text).
6. Static or dynamic? Recommendation for this use case.
7. FAQ (4–6 real questions).
8. Related use cases + relevant guides (internal links).

### 5.3 Guides and alternatives
- Answer-first structure (direct answer in the first 2–3 sentences), H2s phrased as real questions, tables, "Last updated" date.
- Alternatives pages: fair, sourced comparison tables (free limits, trial deactivation policy, dynamic code price, export formats, sign-up requirement). Every competitor claim gets a source URL and date in an HTML comment for my verification. Include "when [competitor] is the better choice".

### 5.4 Technical SEO
- Unique titles (≤ 60 chars) and meta descriptions (≤ 155 chars); per-page OG images.
- Canonicals; generator query-string states canonicalize to the clean URL.
- JSON-LD: `SoftwareApplication` (offers price 0), `FAQPage`, `BreadcrumbList`, `Article` on guides, `Organization` sitewide. Validate with Rich Results Test.
- Auto-generated sitemap from a content registry; robots.txt; Google Search Console + Bing Webmaster Tools.
- Internal linking: home ↔ all use-case pages; each use-case page links to 3 related pages and 2 guides.
- Content in MDX so I can edit copy without touching components.
- Architecture ready for localized versions later (Spanish, Portuguese, Indonesian, Hindi/Urdu); plan hreflang but don't build translations yet.
- `qrfinity.link` must be `noindex` and excluded from the sitemap.

### 5.5 AI-answer readiness
- Consistent short "About QRfinity" fact block (free, unlimited static and dynamic, never expires, analytics, formats) reused on home, pricing and alternatives pages.
- Easy-to-quote tables and direct answers. Ensure Bingbot and AI crawlers can reach marketing pages (report Cloudflare bot settings).

**Stop and report with the full list of URLs, titles and meta descriptions for my review. Publish pages as `noindex` until I approve them.**

---

## Phase 6: Monetization hooks (flags only, no billing yet)

Plan structure for later (build feature-flag plumbing and a waitlist, not payments):

- **Free forever:** unlimited static + dynamic codes, full design, all formats, 90-day analytics.
- **Pro (~$6–9/month, monthly billing):** full analytics history + CSV export, custom branded short domain, bulk creation from CSV, geo/device/time-based redirect rules, password protection, UTM builder, retargeting pixels.
- **Business (~$19–49/month):** team seats, client workspaces, API, white-label, hosted landing pages (menu, vCard page, PDF, link-in-bio).

For long-term analytics on Pro, design a scheduled job that rolls Analytics Engine data into daily aggregates in D1/R2 before the 90-day retention window.

Also add:
- An optional "Print your QR code as stickers or magnets" link on the download success screen (URL configurable; I'll point it to my print business).
- A small "Need a QR campaign or landing page built?" link to my agency (URL configurable).
- **No ads** on the generator, dashboard or redirects.

---

## Acceptance criteria

- Static generator works without an account; all formats export; scan check passes for default designs and catches broken ones.
- Dynamic codes redirect in < 50 ms p95, log scans without raw IPs, and stay live indefinitely on free accounts.
- Abuse checks run on create/edit and on a schedule; admin can disable a code in one click.
- All SEO pages are statically rendered, pass Rich Results validation, and score ≥ 90 on Lighthouse Performance/SEO/Accessibility on mobile.
- Unit tests for slug generation, redirect logic, URL validation and analytics parsing; an end-to-end test that creates a dynamic code, scans it via HTTP, edits the destination and confirms the new redirect.

## Out of scope for now

Billing, Pro features beyond flags, AI-art QR codes, translated pages, native mobile apps.
