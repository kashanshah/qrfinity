# QRfinity architecture (Phase 1)

Status: **decisions approved by Kashan on 2026-10-15; this revision awaits final sign-off before Phase 2.**
Revision 2 (replaces the all-Cloudflare draft of the same date).

## Summary

| Area | Decision |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript + Tailwind + Zustand |
| Web app hosting | **Vercel** (existing Pro plan), kept portable: no Vercel-only services, every outside service behind an interface, weekly portability build |
| Redirect service | **Cloudflare** Worker on `qrfinity.link`, in its **own Cloudflare account** |
| Database | **Postgres on Neon** (via the Vercel Marketplace), Drizzle ORM, checked-in migrations |
| Hot-path lookup | Workers KV (`slug → destination record`), no extra cache layer at launch |
| Scan analytics | Workers Analytics Engine; 90-day retention = the free analytics window |
| Files | R2 through its S3-compatible API |
| Auth | Better Auth: email magic link + Google, Turnstile on sign-up |
| Email | Resend |
| Abuse screening | Google Web Risk (licensed for commercial use) + our own blocklist |
| Dashboard | `qrfinity.com/dashboard` |
| DNS | `qrfinity.com` and `qrfinity.ca` stay on Hostinger DNS; `qrfinity.link` nameservers move to Cloudflare |
| Edit propagation | Usually instant; up to about a minute where a code was scanned moments before |
| Cost | Cloudflare ~$5/month at 1M and 10M scans, ~$48 at 50M; plus Vercel Pro (already paid) and Neon ($0 to start) |

## 1. System overview

```
                    qrfinity.com (Vercel)                              qrfinity.link (Cloudflare account B)
  ┌───────────────────────────────────────────────┐        ┌──────────────────────────────────────────┐
  │ Next.js app                                    │        │ redirect Worker  (qrfinity.link/*)        │
  │  • marketing + SEO pages (static, MDX)         │        │   KV get → 302 / paused / warning / 404   │
  │  • generator (100% in the browser)             │        │   KV miss → Postgres via Hyperdrive       │
  │  • dashboard + /api (server-rendered, Node)    │        │   → write 1 Analytics Engine data point   │
  │  • Vercel Cron → /api/cron/* (DB-side jobs)    │        │                                          │
  └──────┬───────────────┬───────────────┬────────┘        │ edge-api Worker  (edge.qrfinity.link)     │
         │ SQL           │ signed HTTPS  │ SQL API (read)   │   private, HMAC-signed requests only:     │
         ▼               └──────────────►│─────────────────►│   put/delete KV records                   │
  ┌──────────────┐                       │                  │   cron: rotate daily visitor-hash salt    │
  │ Neon Postgres│◄── read-only role ────┼──── Hyperdrive ──│                                          │
  │ (source of   │                       │                  │ KV · Analytics Engine · Rate limiting     │
  │  truth)      │                       ▼                  └──────────────────────────────────────────┘
  └──────────────┘            Analytics Engine SQL API
         R2 (logos, S3 API) · Resend (email) · Google Web Risk (URL reputation)
```

The rule of thumb: **Postgres is the source of truth; KV is a fast, disposable copy for scans.** Anything in KV can be rebuilt from Postgres.

## 2. Web app on Vercel, built to move

### Why Vercel

You already pay for Pro, it has first-class Next.js support, and every pull request gets a preview deploy. The expensive part of the system per request, the redirects, stays on Cloudflare, so Vercel only serves the site and dashboard, which fits comfortably in Pro's included usage at our expected traffic.

### Portability rules

These keep a later move to Cloudflare (via OpenNext), AWS, Netlify or a Docker host to a deploy change, not a rewrite.

1. **No Vercel-only services.** No Vercel KV, Blob, Edge Config or Vercel Postgres. Neon is billed through the Vercel Marketplace but is plain Postgres with a standard connection string.
2. **Node runtime only,** standard `next build`, configuration from environment variables only.
3. **Every outside service sits behind a small interface** in `packages/core`, with one implementation today:

   | Interface | Today | Could swap to |
   | --- | --- | --- |
   | `CodeStore` | Drizzle + Neon Postgres | any Postgres (Supabase, RDS, Hyperdrive) |
   | `EdgeSync` | edge-api Worker → Cloudflare KV | a KV binding (if the app moves to Cloudflare), Redis |
   | `ScanAnalytics` | Analytics Engine SQL API | ClickHouse, Tinybird |
   | `BlobStore` | R2 via S3 API | S3, any S3-compatible store |
   | `Mailer` | Resend | SES, Postmark |
   | `RateLimiter` | Postgres table (fixed window) | Upstash / Redis |
   | `UrlReputation` | Google Web Risk | another reputation feed |

4. **Scheduled jobs are plain HTTP routes** (`/api/cron/*`, protected by a secret). Vercel Cron calls them today; any scheduler (Cloudflare Cron, GitHub Actions) can call them later.
5. **Portability check in CI:** a weekly GitHub Actions job builds the app with the OpenNext Cloudflare adapter. If something stops being portable, we find out that week.

Moving the app to Cloudflare later: deploy with OpenNext, point Drizzle at the same Neon database through Hyperdrive, optionally swap `EdgeSync` to a direct KV binding. No data migration.

### Rendering model

- **Marketing and SEO pages:** statically generated from MDX at build time, full HTML without JavaScript, served from Vercel's CDN.
- **Homepage generator:** static HTML plus a client component. QR rendering, logo processing, export and scan checks all run in the browser; static codes never touch our servers.
- **Dashboard and auth:** server-rendered on demand at `qrfinity.com/dashboard`, `noindex`, excluded from the sitemap.
- **API:** Next.js route handlers under `/api/*`.
- **Images:** pre-sized at build time; we don't depend on Vercel's image optimizer, which wouldn't move with us.

## 3. Redirect service on qrfinity.link

Two Workers in a dedicated Cloudflare account. Every competitor we looked at (QR Code Generator PRO on `qrco.de` and `l.ead.me`, QR TIGER on `qr1.be`) isolates redirects on separate short domains; we do the same and also separate the account.

### Why a separate Cloudflare account

Domain reputation (Safe Browsing, spam lists) is tracked per domain, but Cloudflare's own abuse enforcement can act on an account: a phishing warning on a hostname or, in bad cases, account restrictions. With the site on Vercel, every Cloudflare resource belongs to the redirect service anyway, so a separate account costs nothing extra and keeps anything else you run on Cloudflare out of reach. This account holds the one Workers Paid plan ($5/month).

### Redirect Worker (`qrfinity.link/*`)

```
GET https://qrfinity.link/aB3xK9q
  1. KV get "s:aB3xK9q" (KV caches reads at each location)
       hit  → record
       miss → Postgres via Hyperdrive (read-only role, one view) → write KV → record
              not found → friendly 404 (negative result cached 5 min in the Cache API,
                          plus a per-visitor rate limit, so slug guessing can't hammer Postgres)
  2. record.status
       active   → 302 to destination
       paused   → "This code is paused by its owner" (owner action only)
       disabled → neutral warning page; never the destination
  3. ctx.waitUntil(): one Analytics Engine data point, after the response is sent
```

- **KV record** (`s:{slug}`): `{ id, dest, status, v }`. `v` is a version number so a delayed write can never overwrite a newer one.
- **302, not 301,** so phones and browsers don't cache the destination.
- **Latency target p95 < 50 ms:** a KV hit is a few milliseconds at the edge. The Postgres fallback only happens for a slug missing from KV, and it refills KV.
- **No interstitials, no ads, no cookies** on the short domain.
- **`noindex`:** `X-Robots-Tag: noindex` on every response; never in a sitemap. `robots.txt` does **not** disallow crawling, because a blocked crawler never sees the `noindex` header and can still index bare URLs. Crawlers seeing our warning page also helps clear a Safe Browsing flag after we disable a code.
- **Report link** on the 404, paused and warning pages: `qrfinity.com/report?code={slug}`, `rel="nofollow"`.

### edge-api Worker (`edge.qrfinity.link`)

Private. Accepts only requests signed by the app (HMAC with a shared secret plus a timestamp, rejected after 5 minutes). It puts and deletes KV records, and runs a Cloudflare Cron that rotates the daily visitor-hash salt. Keeping writes in a separate Worker means the public redirect Worker has no write paths at all.

### Keeping KV in step with Postgres

1. The app writes Postgres first (source of truth), in the same transaction adding a row to `edge_sync_outbox`.
2. It calls edge-api to update KV; on success the outbox row is deleted.
3. A Vercel Cron job every minute retries any outbox rows left behind (edge-api briefly unreachable, timeouts).

New codes also self-heal through the Postgres fallback; the outbox matters for edits, pauses and disables, where a stale KV record would otherwise linger.

### Edit propagation

KV is eventually consistent: each Cloudflare location caches a value for a short time after reading it. We set the lowest allowed `cacheTtl` (believed to be 30 seconds; confirm in Phase 3). In practice:

- If nobody scanned the code at that location in the last half-minute or so, the next scan gets the new destination **immediately**. This is most edits.
- Where the code was scanned moments before (a busy menu, or you testing it yourself), the old destination can show for up to about a minute.

Dashboard copy: "Saved. Scans open the new link right away. A phone that just scanned it may take up to a minute." Abuse disables use the same path, so takedowns land within about a minute.

There is deliberately **no extra Cache API layer** in front of KV at launch (apart from cached 404s). It would save KV reads but double the worst-case delay. Its cost only matters above 10M scans/month (about $10–20/month at 50M); we can add it then. Near-instant global updates (Durable Objects or global purge) remain a later option and would stay free.

### What we log per scan (Analytics Engine)

| Field | Source |
| --- | --- |
| index | code id (also the sampling key, so heavy codes can't skew others) |
| timestamp | automatic |
| country, region, city | `request.cf` |
| device type, OS, browser | user-agent, parsed with a small regex parser (no large UA library on the hot path) |
| referer host | `Referer` header, host only |
| visitor hash | `SHA-256(daily_salt + IP + UA + code id)`, truncated; only for counting unique scans per day |

**No raw IP is ever stored or logged.** The salt lives in KV, is replaced daily by edge-api's cron, and the old one is deleted, so hashes can't be reversed or linked across days. The dashboard reads Analytics Engine through its SQL API (server side, results cached 5 minutes) using an API token limited to analytics read. Data is kept 90 days, which defines the free analytics window; Pro's long-term history (Phase 6) will roll daily aggregates into Postgres before the window closes.

To confirm early in Phase 3: that Analytics Engine SQL supports distinct counts for unique scans. If not, unique scans come from a daily aggregate job.

### Short domain on every code

Each code stores its short domain (`codes.domain`, default `qrfinity.link`) rather than assuming it. That lets us add a backup short domain for *new* codes if `.link` were ever flagged (QR Code Generator PRO runs several), and Pro custom domains fit the same column later. Printed codes never change domain. Custom domains will use Cloudflare for SaaS (customer adds a CNAME, certificate issued automatically), the same pattern competitors use.

## 4. Data: Postgres on Neon

### Why Postgres

D1 is only usable directly from a Cloudflare Worker; from Vercel it would go through Cloudflare's REST API, which is slow, rate-limited account-wide and has no real transactions. It would also tie us to Cloudflare. Postgres is reachable from both clouds (Vercel directly, Workers via Hyperdrive) and runs anywhere.

Neon specifically: a database branch per Vercel preview deploy, scale-to-zero while we're small, billing through your Vercel account. The database lives in the same region as the Vercel functions (US East). Better Auth and Drizzle both support it fully. The redirect hot path doesn't touch Postgres except on a KV miss.

### Schema sketch (Drizzle)

- **Auth (Better Auth):** `user`, `session`, `account`, `verification`.
- **`codes`:** `id`, `user_id`, `kind` (`static` | `dynamic`), `domain`, `slug` (unique per domain, dynamic only), `content_type`, `destination`, `payload` (jsonb, non-URL content), `design` (jsonb), `status` (`active` | `paused` | `disabled`), `disabled_reason`, `folder_id`, `risk_status`, `risk_checked_at`, `created_at`, `updated_at`, `deleted_at`.
- **`destination_history`:** `code_id`, `old_destination`, `new_destination`, `changed_at`, `changed_by`.
- **`folders`, `tags`, `code_tags`, `templates`** (saved designs).
- **Sync and limits:** `edge_sync_outbox`, `rate_limits`.
- **Abuse and admin:** `reports`, `blocklist` (domains, patterns, TLDs), `audit_log`, `user.suspended_at`.
- **Later:** `waitlist`, `feature_flags`.
- **`redirect_lookup` view:** slug, domain, id, destination, status. The only thing the redirect Worker's read-only role can select.

Static codes are stored only if a signed-in user saves them. Anonymous generation leaves nothing on our servers.

### Slugs

7-character base62 from `crypto.getRandomValues` with rejection sampling (no modulo bias), about 3.5 trillion combinations. The unique index catches collisions and we retry. A short word filter skips obvious profanity. Slugs are never reused, even after deletion.

### Files (R2)

A private R2 bucket for logos that signed-in users save with a template, accessed through the S3 API. It lives in a Cloudflare account other than the `qrfinity.link` one (your existing account or a new free one), so an enforcement action on the short domain can't break the dashboard. Anonymous users' logos never leave the browser.

## 5. Auth

**Better Auth** with the magic-link plugin, Google OAuth and the Drizzle Postgres adapter. Sessions are httpOnly, Secure, SameSite=Lax cookies on `qrfinity.com`.

- **Turnstile** on the sign-up / magic-link form (free; works from any host).
- **Rate limits** (Postgres-backed `RateLimiter`): magic-link requests per email and per visitor hash; code creation and edits per account, set well above normal business use. Vercel's firewall rate rules can add a blunt outer layer.
- No credit card, ever.

## 6. Email

**Resend** for magic links and account emails. Free: 3,000 emails/month, capped at 100/day; $20/month for 50,000. We move to the paid plan before public launch so a busy day can't block sign-ins. Sending domain `mail.qrfinity.com` with SPF, DKIM and DMARC records added at Hostinger.

## 7. Abuse screening (built in Phase 4)

- **On create and edit:** Web Risk Lookup API plus our own rules: block raw IPs, other shorteners, `data:` and `javascript:` URLs, configurable bad TLDs, and our blocklist. Failures are rejected with a plain explanation.
- **Periodic re-check (Vercel Cron):** Web Risk Update API. `threatLists.computeDiff` downloads hash prefixes for free; we store them and check every active destination locally, calling the paid `hashes.search` only on a local prefix match, which is rare.
- **Licensing:** Safe Browsing API is non-commercial only; Web Risk is the commercial product, billed through Google Cloud.
- **Pricing to confirm in Phase 4:** Lookup is free up to 100,000 calls/month, then $0.50 per 1,000. Google's table appeared to list `hashes.search` at $50 per 1,000 with unclear tiers; the design keeps those calls rare either way.
- **Admin disable:** sets `status = disabled` in Postgres, pushes it to KV through the outbox, and writes `audit_log`. Live within about a minute.

## 8. Domains and DNS

| Domain | Registrar | DNS | Points to |
| --- | --- | --- | --- |
| `qrfinity.com` | Hostinger | Hostinger | Vercel: apex A record and `www` CNAME as shown in the Vercel project |
| `qrfinity.ca` | Hostinger | Hostinger | Vercel, 301 redirect to `qrfinity.com` (Vercel handles SSL) |
| `qrfinity.link` | Hostinger | **Cloudflare** (account B) | Redirect and edge-api Workers |

- The `.link` nameserver change happens in Phase 3, when the redirect Worker exists. Nothing changes in DNS before deploy.
- Hostinger DNS also gets the Resend mail records and the Google Search Console / Bing verification records.
- **Do now:** turn on 2FA and registrar (transfer) lock at Hostinger. All three domains are in one account, and losing it would put every printed code at risk.

## 9. Repository layout and tooling

```
apps/
  web/          Next.js app → Vercel (qrfinity.com)
  redirect/     Redirect Worker → qrfinity.link
  edge-api/     Private KV-write + salt-rotation Worker → edge.qrfinity.link
packages/
  core/         Framework-free: interfaces, slug generation, URL validation and blocklist rules,
                KV record schema, UA parsing, analytics field mapping, types
  db/           Drizzle schema, migrations, query helpers (used by apps/web; redirect reads the view)
brand/          Existing tokens, fonts, logos (tokens.css imported by apps/web)
docs/
```

- **Package manager:** pnpm workspaces.
- **Tests:** Vitest for `packages/core`; `@cloudflare/vitest-pool-workers` for the Workers against local KV; Playwright for the end-to-end test (create a dynamic code, request the short URL, edit the destination, confirm the new redirect).
- **Lint and format:** ESLint + Prettier, `tsc --noEmit` in CI.
- **CI/CD:** GitHub Actions runs lint, typecheck and tests on every PR. Vercel deploys the app (preview per PR with its own Neon branch; production on `main`). Workers deploy with `wrangler` from Actions. Weekly OpenNext portability build.
- **Environments:** `preview` (separate KV namespace, Neon branch, workers.dev hostnames) and `production`.
- **Secrets:** Vercel environment variables and Wrangler secrets (database URLs, Google OAuth, Resend, Web Risk, edge-api HMAC key, Analytics Engine read token). Never in the repo.

## 10. Crawler settings

`qrfinity.com` is not behind Cloudflare, so Cloudflare's AI-bot blocking doesn't apply to it. On Vercel we keep bot protection off for marketing pages so Googlebot, Bingbot and AI crawlers can reach them; Turnstile and rate limits protect forms. Phase 5 reports the exact settings.

`qrfinity.link` (Cloudflare, set when the zone is added): Search **Allow** (crawlers must see `noindex` and our warning pages), Agent **Allow** (AI assistants can follow a short link a person asks about), Training **Block** (nothing to train on), "I monetize pages that serve ads" unchecked. The zone also gets `v=spf1 -all` and a `p=reject` DMARC record, since the domain sends no email and phishers like to spoof short domains.

## 11. Monthly cost estimates

Rates (as published mid-2026; re-check before launch):

- **Cloudflare Workers Paid:** $5/month. Requests: 10M included, then $0.30/M. CPU: 30M CPU-ms included, then $0.02 per M CPU-ms. KV: 10M reads included, then $0.50/M; 1M writes included. Analytics Engine: 10M data points included, then $0.25/M (Cloudflare says it isn't billed yet but will be soon; included here). Hyperdrive included.
- **Vercel Pro:** $20/month, already paid.
- **Neon:** free plan to start; usage-based paid plan roughly $5–20/month as data grows (confirm current pricing).
- **Resend:** $0, then $20/month before launch.

Assumptions: every scan is one Worker request, one KV read and one Analytics Engine data point; ~1.5 ms CPU per scan; no extra cache layer.

| Line item | 1M scans | 10M scans | 50M scans |
| --- | --- | --- | --- |
| Workers Paid base | $5.00 | $5.00 | $5.00 |
| Requests | $0 | $0 | $12.00 |
| CPU | $0 | $0 | ~$0.90 |
| KV reads | $0 | $0 | $20.00 |
| Analytics Engine | $0 | $0 | $10.00 |
| **Cloudflare total** | **~$5** | **~$5** | **~$48** |
| Vercel Pro | already paid | already paid | already paid |
| Neon | $0 | $0–20 | ~$20 |
| Resend | $0–20 | $20 | $20 |
| Web Risk (create/edit lookups) | $0 under 100k/month | $0 under 100k/month | $0.50 per 1,000 above 100k |
| Domains | ~$2.50/month averaged | same | same |

Adding a Cache API layer in front of KV at 50M scans would bring the Cloudflare total to roughly $34–42, at the cost of slower edit propagation (section 3).

## 12. To confirm during the build

- Phase 3: KV's minimum `cacheTtl`; Analytics Engine distinct counts; Hyperdrive pricing on Workers Paid.
- Phase 4: Web Risk pricing tiers and Google Cloud billing setup.
- Before launch: Vercel Pro included usage vs. actual traffic; Neon plan; all Cloudflare rates above.

## Next

On final sign-off, Phase 2 starts: the monorepo scaffold, design tokens wired into Tailwind, and the client-side static generator.

## 13. Implementation notes (Phase 3)

What was built differs from the plan above only in these details:

- **Read-only role grant** is a migration (`0001_grant_redirect_reader.sql`) that applies when the `redirect_reader` role exists, so recreating the view never silently breaks the Worker's fallback.
- **Outbox rows carry the code version.** A push clears rows at or below the version it pushed, so a slow retry can't drop a newer pending change.
- **Local analytics**: the redirect Worker can also post each scan (signed) to `/api/internal/scans`, which fills `scan_events` in Postgres. The dashboard reads the same report shape from there. Production leaves this off and reads Analytics Engine.
- **Worker observability is off**: invocation logs would store request headers, including visitor IPs.
- **Sessions store no IP** (`advanced.ipAddress.disableIpTracking`); sign-in limits use keyed hashes in Postgres instead of Better Auth's IP limiter.
- **`proxy.ts`** (Next.js 16's middleware) sends signed-out visitors to `/login?next=…`; every page still verifies the session.
- **Testing**: Worker logic lives in binding-free handlers tested in Node; the end-to-end suite runs the app and both Workers under wrangler against a real Postgres database.
