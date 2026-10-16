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

## Dynamic codes (Phase 3, October 2026)

- **Slugs**: 7 random base62 characters, collision-checked by a unique index; never reused, even after deletion.
- **Sync**: Postgres first, then KV through the edge-api Worker; an outbox row (with the code version) is queued in the same transaction and a Vercel Cron retries every minute. A delayed write can never replace a newer version.
- **Redirect Worker**: KV with a 30 s edge cache, then the Postgres view through Hyperdrive with a read-only role; misses are cached for 5 minutes and fallbacks are rate-limited per hashed IP. 302 only. Paused → "paused by its owner" page; disabled → warning page, never the destination. Worker logs are off because they would record visitor IPs.
- **No raw IPs anywhere**: Better Auth's IP tracking is off (sessions store none), rate-limit keys are keyed hashes, unique visitors use a daily salt that expires after 36 hours.
- **Analytics**: Analytics Engine in production; the same report built from a Postgres `scan_events` table locally (the Worker posts signed events to the app). Bots and link previewers are excluded. Unique scans = distinct visitors per code per day. Still to confirm on real Analytics Engine: `COUNT(DISTINCT …)` support.
- **Dynamic content types**: link, WhatsApp, location, app store and social (they resolve to web addresses). Text, Wi-Fi, contact, email, SMS, phone and event stay static.

## Abuse protection (Phase 4, October 2026)

- **On create and edit**: refuse other URL shorteners (fixed list), the configurable blocklist (domains, top-level domains, "address contains"; seeded with `.zip` and `.mov`), raw IPs, private hosts, then Google Web Risk. If Web Risk can't be reached, the change goes through and the code is re-checked within the hour.
- **Re-check**: daily Vercel Cron. Each code is checked a day after creation, a week later, then monthly; each distinct destination is looked up once per run, within `RECHECK_DAILY_BUDGET` (default 3,000 ≈ 90,000 a month, inside Web Risk's free 100,000). This uses the Lookup API, not the Update API planned in Phase 1: simpler, and enough until active destinations pass about 100,000. Then switch to the Update API (local hash-prefix list) as planned.
- **Automatic action**: only for Web Risk's high-confidence threats (malware, phishing): the code is turned off at once, the owner is emailed, and it lands in the admin queue for review. Lower-confidence Web Risk results and blocklist matches on existing codes are flagged for a person to review; the code stays live. *To confirm with Kashan.*
- **Reports**: public `/report` page (linked from every short-domain page and the footer), Turnstile, 10 reports an hour per visitor; reporter email optional and never shown to the owner.
- **Admin** (`/admin`, by role or `ADMIN_EMAILS`, 404 for everyone else): abuse queue (open reports, flagged codes), one-click disable/restore, code and user search, suspend/unsuspend (signs out everywhere, blocks sign-in; codes keep working), blocklist, audit log of every action.
- **Account deletion**: removes email and sign-in, deletes the codes (printed dynamic codes show "not active"), keeps the code rows as tombstones so slugs are never reissued.
- **Legal**: terms, acceptable use and privacy drafts at `/terms`, `/acceptable-use`, `/privacy`, marked as drafts and `noindex`. Open items are in MDX comments marked "TO CONFIRM".

## SEO pages (Phase 5, October 2026)

- **One registry** (`apps/web/content/registry.ts`) holds every public page: path, title (≤ 60), description (90–155), H1, promise line, generator preset and internal links. Metadata, the sitemap, breadcrumbs, related links, hubs and the footer all read from it; `test/registry.test.ts` enforces the limits and link rules.
- **Content is MDX** in `apps/web/content/{use-cases,guides,alternatives,landings}`, rendered by one template (`components/content/ContentPage.tsx`) and statically generated. Each file exports its FAQ, which feeds both the page and the FAQPage structured data.
- **Hub pages** were added beyond the plan's list: `/qr-code-generator`, `/guides`, `/alternatives`, so every page sits two clicks from home and breadcrumbs have a parent.
- **Competitor facts** come from the vendors' own pricing and help pages, each with its source URL and date in an MDX comment and a visible sources list. Research on 2026-10-16 could only read search snippets of those pages (direct fetches failed), so prices and policies must be checked on the live sites before launch. Where a vendor's own pages disagree, the page says so.
- **Structured data**: Organization sitewide; SoftwareApplication (price 0) on the home, use-case, landing and pricing pages; Article on guides and comparisons; FAQPage and BreadcrumbList where present.
- **Share images** are rendered at build time with `next/og`, using TTF copies of the brand fonts and a real QR code (our renderer) that opens the page.
- **Crawlers**: `robots.txt` allows everyone, AI crawlers included, and blocks only private paths. Before launch, pages carry `noindex` instead of a robots block, because a blocked page can't see its `noindex`.
- **Pricing**: Pro shows "coming soon" with a waitlist (`pro_waitlist` table, Turnstile, 10 sign-ups an hour per visitor). No price is published yet.

## Monetization (later)

- Competitors gate by number of dynamic codes (Uniqode $5/mo for 3 codes up to $99; QR TIGER from $7/mo; QR Code Generator PRO Professional: 250 codes). We give codes away and charge for professional features.
- Free forever: unlimited static + dynamic, full design, all formats, 90-day analytics.
- Pro (~$6–9/mo, monthly billing): full analytics history, custom short domain, bulk CSV, smart redirects, password protection, UTM, pixels.
- Business (~$19–49/mo): seats, client workspaces, API, white-label, hosted landing pages.
- Extras: "print your QR code as stickers or magnets" link to Craftigure; "need a campaign built?" link to Teknoffice. No ads on the generator, dashboard or redirects.
- Rule: never move an existing free feature behind the paywall; never deactivate a code.

### Built in Phase 6 (October 2026, no billing yet)

- **Plans in code** (`packages/core/src/plans`): every feature, which plan includes it, and `FREE_FEATURES`, the public promise. A test fails if anything leaves the free list or if a higher plan stops including a lower one.
- **Entitlements = plan + flags.** `user.plan` (free, pro, business) is set by an admin until billing exists. `feature_flags` turns a paid or unreleased feature on for everyone or for named accounts (admin → Feature flags). Flags only add; free features never depend on them. Every change is in the audit log.
- **Analytics history**: a nightly Vercel Cron (`/api/cron/rollup`, 02:40 UTC) rolls yesterday and the day before into `scan_daily` (one row per code per day: scans, uniques, 24 hourly counts, top 25 keys per breakdown). It runs for every code, free or paid, so history already exists when someone upgrades; it's tiny (a few hundred bytes per active code per day). Postgres instead of D1/R2, because Postgres is our database (Phase 1). Ranges over 90 days (1 and 2 years) read the roll-ups and are offered only with `analyticsHistory`. `?days=90` on the cron backfills once after the first deploy. To confirm on real Analytics Engine: `toDateTime()` in the roll-up queries (same caveat as `COUNT(DISTINCT …)`).
- **Partner links**: "Print your QR code as stickers or magnets" after a download (`NEXT_PUBLIC_PRINT_PARTNER_URL`, intended for Craftigure) and "Need a QR campaign or landing page built?" in the footer (`NEXT_PUBLIC_AGENCY_URL`, Teknoffice). Hidden when unset; UTM tags added automatically. No ads anywhere.

### Free taste of paid features (decided 2026-10-16)

Kashan's model: every paid capability comes with a free allowance (usually 1), and Pro buys more. People see exactly what they'd pay for before paying. Rules that keep it consistent with our promise:

- **A free allowance, once offered, never shrinks for anything that exists.** Admins can lower a default for new use; what people already made keeps working and stays theirs.
- **Stopping paying never breaks anything.** Paid extras created while subscribed keep working (codes keep redirecting, custom links stay); you just can't add more.
- **Only countable features get a "1 free".** Custom short links, redirect rules, password-protected codes, landing pages, pixels: yes. Features that are all-or-nothing (a custom domain, white label, team workspaces) or time-based (full analytics history) need another taste, such as a limited preview, decided per feature.

### Custom short links (2026-10-16)

- `qrfinity.link/joes-menu`: 4–40 lowercase letters, digits and single hyphens, chosen at creation and fixed (the link is printed in the code). Never reused, even after deletion.
- Free allowance per account is an admin setting (Admin → Settings, default 1). `moreCustomSlugs` (Pro, or a flag) raises it to 100.
- Refused: reserved paths (admin, login, report…), offensive words, and bank, payment and big-brand names, so our domain can't lend credibility to look-alike scams. Destinations go through the usual screening.
- The redirect and edge-api Workers accept both random and custom slugs, so both must be redeployed with this change.

### Site analytics (2026-10-16)

- Google Analytics 4 and PostHog on qrfinity.com, each off unless its key is set. Never on qrfinity.link (scanners are never tracked) or /admin.
- Consent by region (decided 2026-10-16): the banner shows only in the EU, EEA, UK and Switzerland, or when the country is unknown (`/api/consent-region` reads the Vercel or Cloudflare country header and returns only yes/no). Elsewhere analytics cookies are on by default; "Cookie settings" in the footer and Global Privacy Control turn them off. Quebec's Law 25 may need the banner too; revisit if Quebec traffic matters.
- Until a visitor allows cookies (where we ask): GA runs in Consent Mode v2 with ads storage always denied and Google signals off; PostHog runs in cookieless mode and is proxied through `/ingest`.
- Nothing typed into the generator is captured: session recording off, autocapture limited to clicks on links and buttons with text and attributes masked. Events: `qr_downloaded`, `dynamic_code_created`, `sign_in_requested`, `pro_waitlist_joined`, with type and format only.
- PostHog project must have "Discard client IP data" on (our no-raw-IP rule) and "Cookieless server hash mode" on (otherwise pre-consent events are dropped). The privacy policy describes all of this.

### Usage panel (2026-10-16)

Admin → Usage compares the qrfinity.link Cloudflare account with its plan's limits: Worker requests, KV reads, writes and deletes from Cloudflare's GraphQL analytics API (same `CF_ANALYTICS_TOKEN`, needs Account Analytics: Read), plus our own per-day code creates, destination changes, scans (from roll-ups) and the sync queue. On the free plan the busiest of the last 7 days is compared with the daily limit (green under 50%, watch 50–80%, upgrade over 80%); on paid, the month to date with the included amount. Which plan the account is on is an admin setting. Without the API it estimates KV writes from the database and says Worker requests can't be checked.

## Pricing model (decided 2026-10-16, replaces the Pro/Business plan above)

Kashan's direction: keep every feature free unless it costs us; charge for volume.

- **Free, unlimited:** static codes, dynamic codes, editing, full design, every format, scan analytics including up to 2 years of history (daily roll-ups cost almost nothing), data export.
- **Advanced features** count toward a per-account allowance of codes that may use them: custom short links, redirect rules by device/country/time and password protection (all live). A code counts once however many advanced features it uses. Plain dynamic codes never count.
- **No new jargon for users.** They see "static" and "dynamic" codes, and "advanced features on N codes". Internally: "advanced codes".
- **Plans** (`PLAN_DETAILS` in `packages/core/src/plans`): Free, advanced features on 1 code (admin setting, default 1); Plus 10 codes, $5/month; Pro 100, $20; Unlimited, every code, $50. A $2 tier for 3 codes was dropped (fees would take about a third of it). Yearly prices are 10× monthly (2 months free), a proposal to confirm.
- **Rules carried over:** stopping paying never breaks anything (codes with advanced features keep working; you can't add more); an allowance never shrinks for what already exists; free features never move behind a paywall.
- **Dropped:** retargeting pixels (would track scanners on qrfinity.link). **Made free:** analytics history and its CSV. **Undecided:** bulk creation, team seats, API. **Later, only if customers ask:** custom domains (low demand among small businesses, the most work, and a per-domain cost); not shown on the pricing page.
- **Billing: Stripe** (already in use), with Stripe Tax to calculate and collect tax. Canadian GST/HST is generally zero-rated for customers outside Canada, but EU and UK VAT apply to consumer sales from the first sale, US states after their thresholds, and GST/HST to Canadian customers past the $30k small-supplier threshold: confirm with an accountant before launch.
- **Billing built (2026-10-16), see `docs/billing.md`:** Stripe Checkout and customer portal, prices by lookup key, USD tax-exclusive with Stripe Tax. The plan in effect is the higher of the admin-granted plan and a paying subscription (past due keeps it during retries). Upgrades apply now with proration; downgrades at period end. Refunds: in full within 14 days of a plan's first payment, renewals not refunded (also satisfies the EU/UK 14-day withdrawal right without a waiver step). Deleting an account cancels its subscription. Plans stay "Coming soon" until the Stripe keys are set.
- **Redirect rules and free trial (decided 2026-10-16, Kashan):**
  - *Redirect rules* (released): by phone (iPhone/iPad, Android, everything else), country, days and times, or a date range, in the owner's time zone; up to 10 per code, first match wins, else the main destination. Rule destinations are screened like the main one and re-checked by the cron. Each scan records the matching rule's label (Analytics Engine blob10), shown as a "Redirect rules" breakdown.
  - *Free trial:* the first plan is free for 30 days (card collected at checkout; Stripe charges at the end). One trial per account (any earlier subscription row means no trial).
  - *Advanced features follow the plan* (replaces "stopping paying never breaks anything" for advanced features): when a plan ends or stops applying, every code and custom short link keeps redirecting (printed codes never break), but only the oldest codes up to the allowance keep advanced features. On the rest, rules pause (`codes.advanced_paused`; the edge record and `redirect_lookup` leave them out) and scans go to the main destination. They resume when a plan returns. Applied by `refreshAdvancedFeatures` on every subscription sync, admin plan change, allowance setting change and delete.
  - *Failed payments:* a failed renewal keeps the plan while Stripe retries (past due); a failed first payment after the trial stops it at once (`grantsPlan`: past due with `current_period_start <= trial_end`).
- **Dynamic contact cards (2026-10-16):** a dynamic code can be a contact card instead of a link. It has no destination; the redirect Worker shows a self-contained contact page on qrfinity.link (no scripts or cookies, light and dark) with "Save contact" (`/{slug}.vcf`, served inline so iPhones open the add-contact screen) and tap-to-call, email, website and map links. The page view counts as the scan; the .vcf download doesn't. The card's website is screened and re-checked like a destination; redirect rules don't apply. Wi-Fi stays static-only (phones only join a network from data in the code). Events, text, email/SMS/phone could follow the same hosted-page pattern later.
- **Contact page templates (2026-10-16):** four built-in templates (Classic, Banner, Centered, Minimal) and an accent colour, free for everyone. Stored as `codes.content.style`; one renderer in `packages/core/src/links/page-html.ts` serves the Worker and the dashboard preview. The accent defaults to the printed code's colour (brand green when that's black or grey) and is darkened or lightened automatically so text keeps 4.5:1 contrast in light and dark mode. Photo or logo upload is deferred (needs image storage and moderation).
- **Pricing page:** a "Compare plans" table built from `PLAN_DETAILS`, so prices and allowances can't drift from the code.
- **Password protection (2026-10-16):** an advanced feature on any dynamic code (links and contact cards). Only a salted PBKDF2-SHA256 hash is stored (`codes.password_hash`, 10,000 iterations to fit the Worker's CPU budget); it goes to the edge record as `lock` and to `redirect_lookup`, never to a browser (`CodeView.hasPassword`). The Worker shows a password page (POST form, no scripts, no cookies), so the password is asked on every scan; a correct one returns 303 to the destination (rules applied) or shows the contact page, whose Save contact button re-posts it for the .vcf. Wrong guesses are rate-limited per hashed IP and code (`UNLOCK_LIMIT`, 10 a minute). Viewing the password page counts as the scan. Protection is never paused when a plan ends: a protected code must not turn public by itself. The owner can remove it any time.

## Name and domains

- Chosen: **QRfinity** (QR + infinity). Rejected: QRLasts (sounds like "QR Last"; qrlast.com belongs to someone else), QRVow (sounds like "QR Wow"), QRLasting (clear but forgettable), InfiniQR (spelling risk).
- Domains, all available as of 2026-10-15 at ~$11/yr (.com) and $7/yr (.link): **qrfinity.com** (site), **qrfinity.link** (redirects only, isolated for abuse), **qrfinity.ca** (protect the name). Registered by Kashan on 2026-10-15.
- Trademark check (2026-10-15): exact-name searches for "QRfinity" returned 0 results on USPTO (wordmark, live and dead) and on CIPO (all fields). This was a knock-out search only; it does not cover similar-sounding marks (e.g. Comcast's Xfinity, "QR Infinity"). Consider a trademark agent's clearance search and filing before heavy marketing.
- Known risk: people may type qrinfinity.com (owned by someone else).
- Logo: Kashan confirmed he holds the rights to the reference drawing the mark is traced from.

## Brand

See `brand/BRAND.md`. Evergreen + paper + one yellow spark; Bricolage Grotesque for headlines, Manrope for text, JetBrains Mono for short links; the mark spells QR as one woven infinity ribbon (traced from the approved reference drawing: open Q loop, R with straight bar and separate leg, cuts square to each strand), with "finity" in Bricolage 800 set tight against it and yellow i-dots.
