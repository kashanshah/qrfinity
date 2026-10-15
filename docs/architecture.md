# QRfinity architecture proposal (Phase 1)

Status: **proposal, awaiting approval.** No app code until this is signed off.
Date: 2026-10-15.

## Summary of recommendations

| Area | Recommendation |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript + Tailwind + Zustand, as planned |
| Hosting | Everything on Cloudflare: the Next.js app on Workers via the OpenNext adapter, the redirect service as its own Worker |
| Redirects | Separate Worker on its own zone, `qrfinity.link`. KV on the hot path, Cache API in front of KV, D1 as fallback |
| Database | D1 (SQLite) with Drizzle ORM and checked-in migrations |
| Hot-path lookup | Workers KV (`slug → destination record`) |
| Scan analytics | Workers Analytics Engine, 90-day retention = the free analytics window |
| Files | R2 (saved logos for signed-in users; hosted PDFs later) |
| Auth | Better Auth: email magic link + Google, Drizzle/D1 adapter, Turnstile on sign-up |
| Email | Resend (free tier to start, $20/month plan when volume grows) |
| Abuse screening | Google Web Risk (the commercial product; Safe Browsing API is non-commercial only) + our own blocklist |
| Repo | pnpm workspace monorepo: `apps/web`, `apps/redirect`, `packages/core`, `packages/db` |
| Cost | ~$5/month at 1M scans, ~$6 at 10M, ~$35–50 at 50M (details below) |

## 1. Hosting: why all-Cloudflare over Vercel + Cloudflare

**Recommendation: Next.js on Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`).**

Reasons:

1. **Direct bindings.** The app reads and writes D1, KV, R2 and the rate limiter through Worker bindings, in the same data centre, with no API tokens. On Vercel the app would have to reach D1 over Cloudflare's HTTP API (slow, rate-limited, awkward for transactions) or we would switch to Postgres and run two databases.
2. **Cost.** One $5/month Workers Paid plan covers the site, the redirect Worker, KV, D1, R2 and Analytics Engine allowances. Vercel Pro is $20/seat/month plus usage, on top of Cloudflare for redirects.
3. **One vendor, one dashboard, one deploy tool** (`wrangler`). Fewer secrets, fewer moving parts for a small team.
4. **Adapter maturity.** Next.js 16.2 shipped a stable Adapter API built with OpenNext and Cloudflare, so the adapter no longer depends on reverse-engineering Next's build output, and Cloudflare maintains it.

Trade-offs and how we handle them:

- **The adapter can lag new Next.js releases.** We pin Next.js to a version the adapter supports and upgrade deliberately.
- **Node API gaps.** The app runs with `nodejs_compat`. We pick dependencies that run on Workers (Better Auth, Drizzle and Resend all do) and test on `wrangler dev`, not only `next dev`.
- **Worker size limit** (10 MB compressed on Paid). The QR generator libraries are client-side, so they don't count against the server bundle.
- **Image optimization.** We don't use the Next.js image optimizer; images are pre-sized at build time (or served through Cloudflare Images later).
- **Exit path.** We avoid Vercel- and Cloudflare-only APIs in page code; data access goes through `packages/db`. Moving the web app to Vercel later would mean swapping the D1 driver for D1's HTTP API or Postgres, not rewriting pages.

### Rendering model

- **Marketing and SEO pages:** statically generated at build time from MDX, full HTML without JavaScript. With OpenNext these are served from the static/incremental cache, so they are fast, but each page view still counts as a Worker request (included in the cost estimates below). `_next/static` assets and `public/` files are served as free static assets.
- **Homepage generator:** static HTML shell plus a client component. All QR rendering, logo processing, export and scan checks run in the browser. No server calls for static codes.
- **Dashboard and auth pages:** server-rendered on demand at `qrfinity.com/dashboard`, `noindex`.
- **API:** Next.js route handlers under `/api/*` for codes, folders, analytics queries and auth.

Keeping the dashboard on `qrfinity.com` (not a subdomain) keeps cookies simple and one deploy. The dashboard is `noindex` and excluded from the sitemap, so it doesn't affect SEO.

## 2. Redirect service on qrfinity.link

A separate Worker (`apps/redirect`) bound to its own Cloudflare zone, `qrfinity.link`. It shares the account and the KV/D1 resources but no code paths with the site, and the site never serves redirects. If abuse ever gets `qrfinity.link` flagged, `qrfinity.com` keeps its own domain reputation.

```
phone camera
    │  GET https://qrfinity.link/aB3xK9q
    ▼
Redirect Worker (qrfinity.link)
    │ 1. Cache API (per data centre, 60 s TTL)  ── hit ──┐
    │ 2. KV get "s:aB3xK9q"                     ── hit ──┤
    │ 3. D1 read-only lookup → repopulate KV    ── hit ──┤
    │                                                    ▼
    │                         record.status:
    │                           active   → 302 to destination
    │                           paused   → "paused by its owner" page (owner action only)
    │                           disabled → neutral warning page, never the destination
    │                           not found→ friendly 404 (cached 5 min to absorb slug guessing)
    │
    └─ ctx.waitUntil(): write 1 Analytics Engine data point (after the response is sent)
```

Details:

- **KV record** (`s:{slug}` → small JSON): `{ id, dest, status, v }`. `v` is a version number so stale writes can't overwrite newer ones.
- **Writes:** the app writes D1 first (source of truth), then KV. KV propagates globally in up to about 60 s and the Cache API TTL adds up to 60 s more. The dashboard says "Changes go live within 2 minutes." Abuse disables also write KV immediately; if we need faster takedown we lower the cache TTL for disabled checks or use a purge.
- **302, not 301,** so phones and browsers don't cache the destination.
- **Latency target p95 < 50 ms:** a Cache API or KV hit is a few milliseconds at the edge; the D1 fallback only happens on a cold slug and repopulates KV.
- **No interstitials, no ads,** no cookies set on the short domain.
- **`noindex`:** `X-Robots-Tag: noindex` on every response, `robots.txt` disallows all, never in a sitemap.
- **Report link:** the 404, paused and warning pages link to `qrfinity.com/report?code={slug}` (`rel="nofollow"`).

### What we log per scan (Analytics Engine)

One data point per scan in a `scans` dataset:

| Field | Source |
| --- | --- |
| index | code id (also the sampling key, so heavy codes can't skew others) |
| timestamp | automatic |
| country, region, city | `request.cf` |
| device type, OS, browser | user-agent, parsed with a small regex parser (no large UA library on the hot path) |
| referer host | `Referer` header, host only |
| visitor hash | `SHA-256(daily_salt + IP + UA + code id)`, truncated; used only to count unique scans per day |

**No raw IP is ever stored or logged.** The daily salt lives in KV, is generated by a scheduled Worker, and yesterday's salt is deleted, so hashes can't be reversed or linked across days. The dashboard queries Analytics Engine through its SQL API (server side, results cached for 5 minutes). Analytics Engine keeps data 90 days, which sets the free analytics window. Pro's long-term history (Phase 6) will roll daily aggregates into D1 before the window closes.

To confirm early in Phase 3: that Analytics Engine SQL supports distinct counts for the unique-scan metric. If not, unique scans will be counted with a per-day aggregate job instead.

## 3. Data

### D1 rather than Postgres

D1 fits because the hot path never touches it: scans hit KV, writes are low volume (people creating and editing codes), and dashboard reads are small per-user queries. It needs no separate provider, no connection pooling and no extra bill. Limits are comfortable: 10 GB per database holds tens of millions of code rows. If we outgrow one database, D1 read replication and splitting analytics aggregates into their own database are the next steps; Postgres (Neon or Hyperdrive) stays an option because Drizzle supports both.

### Schema sketch (Drizzle, SQLite)

- **Auth (Better Auth tables):** `user`, `session`, `account`, `verification`.
- **`codes`:** `id`, `user_id`, `slug` (unique, dynamic only), `kind` (`static` | `dynamic`), `content_type` (url, wifi, vcard…), `destination`, `payload_json` (non-URL content), `design_json`, `status` (`active` | `paused` | `disabled`), `disabled_reason`, `folder_id`, `risk_status`, `risk_checked_at`, `created_at`, `updated_at`, `deleted_at`.
- **`destination_history`:** `code_id`, `old_destination`, `new_destination`, `changed_at`, `changed_by`.
- **`folders`, `tags`, `code_tags`, `templates`** (saved designs).
- **Abuse and admin:** `reports`, `blocklist` (domains, patterns, TLDs), `audit_log`, user `suspended_at`.
- **Later:** `waitlist`, `feature_flags`.

Static codes are only stored if a signed-in user chooses to save them; anonymous static generation leaves nothing on our servers.

### Slugs

7-character base62 from `crypto.getRandomValues` with rejection sampling (no modulo bias), about 3.5 trillion combinations. Uniqueness is enforced by the D1 unique index; on a collision we retry with a new slug. A short word filter skips slugs that spell obvious profanity. Slugs are never reused, even after a code is deleted.

### R2

A private bucket for logos that signed-in users save with a template. Anonymous users' logos never leave the browser. Hosted PDFs and menus (Pro, later) go in a separate public bucket served from the short domain or a dedicated hostname.

## 4. Auth

**Better Auth** with the magic-link plugin, Google OAuth and the Drizzle adapter on D1. It runs on Workers, keeps users in our own database, and is the actively developed successor in this space (the Auth.js project is now maintained under Better Auth). Sessions are httpOnly, Secure, SameSite=Lax cookies on `qrfinity.com`.

- **Turnstile** on the sign-up / magic-link request form (free).
- **Rate limits** with the Workers rate-limiting binding: magic-link requests per email and per IP hash, code creation and edits per account (limits set well above what a normal business hits, per the plan).
- No credit card is ever asked for.

## 5. Email

**Resend** for magic links and account emails: free tier of 3,000 emails/month (capped at 100/day), then $20/month for 50,000. It has a Workers-compatible SDK and simple domain setup (SPF, DKIM, DMARC on a `mail.qrfinity.com` subdomain). The 100/day cap could bite on a busy launch day, so we upgrade before public launch. Amazon SES is cheaper at high volume but its free tier lasts 12 months and setup is heavier; Cloudflare's own email sending service is worth re-evaluating once it is generally available.

## 6. Abuse screening (built in Phase 4, designed now)

- **On create and edit:** Web Risk Lookup API (`uris.search`), plus our own checks: block raw IPs, other shorteners, `data:` and `javascript:` URLs, configurable bad TLDs, and our blocklist. A destination that fails is rejected with a plain explanation.
- **Periodic re-check:** a scheduled Worker uses the Web Risk Update API. `threatLists.computeDiff` downloads hash prefixes for free; we keep the prefix list in R2/KV and check every active destination locally. Only a local prefix match triggers a paid `hashes.search` call, which is rare. This keeps re-checking all codes close to free instead of paying per URL per sweep.
- **Licensing:** the Safe Browsing API is for non-commercial use only; Web Risk is the licensed commercial product, billed through Google Cloud.
- **Pricing to confirm in Phase 4:** Lookup API is free up to 100,000 calls/month, then $0.50 per 1,000. Google's pricing page lists `hashes.search` at a much higher rate (shown as $50 per 1,000 in the table we could read); the tier boundaries were unclear, so we verify before launch. The design above keeps those calls rare either way.
- **Admin:** disable writes `status = disabled` to D1 and KV in one click and records it in `audit_log`.

## 7. Repository layout and tooling

```
apps/
  web/          Next.js app → Worker on qrfinity.com (OpenNext)
  redirect/     Redirect Worker → qrfinity.link
packages/
  core/         Shared, framework-free: slug generation, URL validation and blocklist rules,
                KV record schema, UA parsing, analytics field mapping, types
  db/           Drizzle schema, D1 migrations, query helpers
brand/          Existing tokens, fonts, logos (tokens.css imported by apps/web)
docs/
```

- **Package manager:** pnpm workspaces.
- **Tests:** Vitest for `packages/core`; `@cloudflare/vitest-pool-workers` for the redirect Worker and API routes against real local KV/D1; Playwright for the end-to-end test (create a dynamic code, request the short URL, edit the destination, confirm the new redirect).
- **Lint and format:** ESLint + Prettier, `tsc --noEmit` in CI.
- **CI/CD:** GitHub Actions runs lint, typecheck and tests on every PR; merges to `main` deploy with `wrangler`. Two environments: `preview` (workers.dev hostnames, separate D1/KV) and `production`.
- **Secrets:** Wrangler secrets (Google OAuth, Resend, Web Risk key, Analytics Engine API token); never in the repo.

## 8. Cloudflare settings to note

- Marketing pages must be reachable by Googlebot, Bingbot and AI crawlers. Cloudflare's "Block AI bots" and AI Crawl Control defaults will be reviewed and set to allow on `qrfinity.com` (Phase 5 will report exact settings).
- Bot Fight Mode off on `qrfinity.com` (it can challenge good crawlers); Turnstile and rate limits protect the forms instead.
- `qrfinity.link`: no caching of HTML by the CDN (the Worker controls caching), HSTS on.

## 9. Monthly cost estimates

Rates used (Workers Paid, as published mid-2026; re-check before launch):

- Workers Paid: $5/month. Requests: 10M included, then $0.30/M. CPU: 30M CPU-ms included, then $0.02 per M CPU-ms. Static asset requests free.
- KV: 10M reads included, then $0.50/M; 1M writes included, then $5/M; 1 GB storage included.
- D1: 25B rows read and 50M rows written included per month; 5 GB storage included.
- Analytics Engine: 10M data points included, then $0.25/M; 1M read queries included. Cloudflare's docs say Analytics Engine is **not billed yet** but will be "in the coming months", so we include it.
- R2: 10 GB storage and the free operations tier cover logos for a long time.

Assumptions: the site itself serves ~2M Worker requests/month (page views, API, auth); the redirect Worker uses ~1.5 ms CPU per scan; every scan is one Worker request and one Analytics Engine data point; "worst case" assumes every scan misses the Cache API and reads KV.

| Line item | 1M scans | 10M scans | 50M scans |
| --- | --- | --- | --- |
| Workers Paid base | $5.00 | $5.00 | $5.00 |
| Requests (scans + 2M site) | $0 (3M) | $0.60 (12M) | $12.60 (52M) |
| CPU | $0 | $0 | ~$0.90 |
| KV reads, worst case | $0 | $0 | $20.00 |
| KV reads, with Cache API (est. 30–70% hits) | $0 | $0 | $6–14 |
| Analytics Engine data points | $0 | $0 | $10.00 |
| D1, R2, KV writes | $0 | $0 | ~$0 |
| **Cloudflare total** | **~$5** | **~$6** | **~$35–49** |
| Resend | $0 | $0–20 | $20 |
| Web Risk (create/edit lookups) | $0 under 100k/month | $0 under 100k/month | $0.50 per 1,000 above 100k |
| Domains (.com, .link, .ca) | ~$2.50/month averaged | same | same |

Note: `docs/decisions.md` estimated ~$30 at 50M scans; that figure left out KV reads. The Cache API layer is what keeps the real number near it.

## 10. Decisions I need from you

1. **Approve all-Cloudflare hosting** (Next.js via OpenNext) rather than Vercel for the app.
2. **Approve D1 + Drizzle** rather than Postgres.
3. **Approve Better Auth + Resend.**
4. **Dashboard location:** `qrfinity.com/dashboard` (recommended) or `app.qrfinity.com`.
5. **Cloudflare account:** both domains in one account as separate zones (recommended), or a second account for `qrfinity.link` for extra separation.
6. **Edit propagation:** is "changes go live within 2 minutes" acceptable? The alternative is a shorter cache TTL at a somewhat higher KV cost.

Once approved, Phase 2 starts with the monorepo scaffold, design tokens wired into Tailwind, and the client-side static generator.
