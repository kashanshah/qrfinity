<p><img src="brand/logo/qrfinity-logo.svg" alt="QRfinity" height="48"></p>

**QR codes that never expire.** A free QR code generator: unlimited static and dynamic codes, scan analytics, every export format, no watermark, no trial.

## Repository

| Path | What |
| --- | --- |
| `apps/web` | Next.js app (qrfinity.com): generator, sign-in, dashboard, analytics. Deployed on Vercel |
| `apps/redirect` | Cloudflare Worker for qrfinity.link: KV lookup, Postgres fallback, 302, scan logging |
| `apps/edge-api` | Private Cloudflare Worker: the only writer of link records in KV (HMAC-signed requests) |
| `packages/core` | Framework-free core: encoders, QR renderer, scan checks, slugs, link records, signing, analytics |
| `packages/db` | Drizzle schema and migrations (Postgres) |
| `docs/build-plan.md` | Phased build plan (architecture → static generator → dynamic codes → abuse protection → SEO pages → monetization hooks) |
| `docs/architecture.md` | Architecture (Phase 1): Vercel app, Cloudflare redirects, Postgres, auth, DNS, costs |
| `docs/decisions.md` | Research and decisions: market, ranking strategy, costs, pricing, naming |
| `brand/BRAND.md` | Brand book: voice, logo, colour, type, spacing, components |
| `brand/tokens.json` / `brand/tokens.css` | Design tokens (light + dark) and the compiled CSS variables |
| `brand/logo/` | Logo, mark and app icon (SVG, plus PNG icons) |
| `brand/fonts/` | Self-hosted Bricolage Grotesque, Manrope, JetBrains Mono (SIL OFL 1.1) |

## Development

Requires Node 22, pnpm 10 (`corepack enable`) and Postgres 16.

```sh
pnpm install
cp apps/web/.env.example apps/web/.env.local     # local defaults work as is
createdb qrfinity && createdb qrfinity_test       # as a user that owns them (see .env.example)
DATABASE_URL=postgres://qrfinity:qrfinity@localhost:5432/qrfinity pnpm db:migrate
pnpm dev:workers  # redirect Worker on :8787, edge-api on :8788 (wrangler, shared local KV)
pnpm dev          # app on http://localhost:3000
```

Sign-in emails go to the dev mailbox (`DEV_MAILBOX=1`): the link is printed in the app's console. For the redirect Worker's Postgres fallback locally, create the read-only role once: `psql -v password="'redirect_reader'" -f packages/db/sql/redirect-reader.sql` (as a superuser), then re-run migrations.

```sh
pnpm test         # unit + integration (needs Postgres: qrfinity_test)
pnpm build && pnpm test:e2e   # Playwright: starts the app and both Workers, uses qrfinity_e2e
pnpm lint && pnpm typecheck && pnpm format:check
```

The EPS test renders through Ghostscript when `gs` is installed (CI installs it) and is skipped otherwise.

## Deploying

Nothing is deployed yet. The order, once accounts exist:

1. **Neon** (via Vercel Marketplace): create the database, run `pnpm db:migrate` with its direct URL, then create the read-only role with `packages/db/sql/redirect-reader.sql` and re-run migrations (the grant is applied automatically when the role exists).
2. **Cloudflare (the qrfinity.link account)**: Workers Paid plan; create a KV namespace and a Hyperdrive config pointing at Neon with the `redirect_reader` role; put both ids in `apps/redirect/wrangler.jsonc` and `apps/edge-api/wrangler.jsonc`; `wrangler secret put EDGE_API_SECRET` for edge-api; `pnpm --filter @qrfinity/redirect deploy` and `pnpm --filter @qrfinity/edge-api deploy`. Create an API token with *Account Analytics: Read* for the dashboard.
3. **Resend**: verify `mail.qrfinity.com` (SPF, DKIM, DMARC at Hostinger).
4. **Turnstile**, **Google OAuth** (redirect URI `https://qrfinity.com/api/auth/callback/google`) and a **Google Web Risk** API key (Google Cloud project with billing; first 100,000 lookups a month free).
5. **Vercel**: import the repo, Root Directory `apps/web`, set the variables from `apps/web/.env.example` (production values: no `DEV_MAILBOX`, no `TURNSTILE_DISABLED`, `ANALYTICS_BACKEND=analytics-engine`, empty `SHORT_LINK_ORIGIN`). The edge-sync (every minute) and destination re-check (daily) crons are in `apps/web/vercel.json`. Set `ADMIN_EMAILS` to your email to open `/admin`. Pages stay `noindex` until `NEXT_PUBLIC_INDEXABLE=true`.

## Status

Phases 1–3 done. Phase 4 (abuse protection: screening, re-checks, reports, admin panel, draft legal pages) is built and awaiting review. The legal drafts need legal review before public launch.
