# QRfinity

A free QR code generator whose codes never expire, built as an organic traffic magnet. Owner: Kashan (Teknoffice Technologies Inc., Canada).

## Read first

1. `docs/build-plan.md`: the phased build plan. Work through it in order. **Stop at the end of each phase, summarize what changed, and wait for approval.**
2. `docs/decisions.md`: research, positioning, pricing and naming decisions. Don't reopen them without a reason.
3. `brand/BRAND.md`: voice, logo, colour, type and component rules. All UI follows it.

## Where things stand

- Brand and final logo are done. Phase 1 architecture approved (2026-10-15), recorded in `docs/architecture.md`.
- Phase 2 (static generator) approved.
- Phase 3 (accounts, dynamic codes, redirect + edge-api Workers, analytics) done; PR kashanshah/qrfinity#1.
- Phase 4 (abuse protection, reports, admin, draft legal pages) approved and merged. Legal drafts need Kashan's/a lawyer's review before launch.
- Phase 5 (SEO pages) approved and merged; pages stay `noindex` until `NEXT_PUBLIC_INDEXABLE=true`. Competitor facts on `/alternatives/*` must be re-checked on the live sites before launch.
- Phase 6 (plans, feature flags, analytics roll-ups, partner links; no billing) is built and **awaits review**. It is the last phase in the plan.
- Domains qrfinity.com, qrfinity.link and qrfinity.ca are registered. Exact-name trademark searches (USPTO, CIPO) came back clear.

## Non-negotiables

- Codes never expire. Never build anything that deactivates, pauses or meters a free user's code (owner-initiated pause excepted).
- Free features never move behind a paywall. Paid plans only add new capabilities.
- Static generation is fully client-side; no sign-up for static codes.
- The redirect service runs on qrfinity.link, isolated from qrfinity.com.
- Abuse protection (URL-reputation checks, reporting, admin disable) ships before public launch.
- No ads on the generator, dashboard or redirects. No raw IP storage.

## Stack and conventions

- Next.js (App Router) + TypeScript + Tailwind + Zustand. Web app on Vercel, kept portable (no Vercel-only services; outside services behind interfaces in `packages/core`). Postgres on Neon with Drizzle. Redirects on Cloudflare (Workers, KV, Analytics Engine) in a separate account for `qrfinity.link`. Better Auth + Resend. See `docs/architecture.md`.
- Design tokens: `brand/tokens.json` is the source of truth. Regenerate CSS with `python3 brand/scripts/build-tokens-css.py brand/tokens.json ./fonts/ > brand/tokens.css`. Map Tailwind theme values to the CSS variables (`var(--evergreen)` etc.); never hard-code hex values in components.
- Fonts are self-hosted from `brand/fonts/` (SIL OFL 1.1). Logos and app icons are in `brand/logo/`.
- Copy: sentence case, plain words, no emoji in UI, spell the name **QRfinity**.
- QR rendering: our own renderer in `packages/core` (uqr for the matrix → scene → SVG/EPS); PDF via jsPDF + svg2pdf; scan check decodes with zxing-wasm in a worker, wasm self-hosted from `public/wasm`. Frame text uses Helvetica/Arial so every format matches.
- Dynamic codes: Postgres is the source of truth; every change that affects redirects bumps `codes.version`, queues `edge_sync_outbox` in the same transaction and pushes via the edge-api Worker (`apps/web/lib/server/codes.ts`). Services take a `ServiceContext` and are scoped to one user.
- Web app imports drizzle helpers from `@qrfinity/db` (never `drizzle-orm` directly; Better Auth pulls a second copy).
- Commands: `pnpm dev`, `pnpm dev:workers`, `pnpm db:migrate`, `pnpm test` (needs local Postgres), `pnpm test:e2e` (after `pnpm build`), `pnpm lint`, `pnpm typecheck`, `pnpm format:check`.
- Paid features: check `getEntitlements(db, userId)` (`apps/web/lib/server/entitlements.ts`), never the plan directly. New features go in `FEATURES` in `packages/core/src/plans`; nothing ever leaves `FREE_FEATURES`.
- SEO pages are statically rendered, content in MDX (`apps/web/content/`), each with unique copy. Add a page by adding it to `content/registry.ts` (the sitemap, footer, hubs and metadata follow) and writing its MDX. Every competitor claim carries `{/* source: URL, seen DATE */}`.
