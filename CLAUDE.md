# QRfinity

A free QR code generator whose codes never expire, built as an organic traffic magnet. Owner: Kashan (Teknoffice Technologies Inc., Canada).

## Read first

1. `docs/build-plan.md`: the phased build plan. Work through it in order. **Stop at the end of each phase, summarize what changed, and wait for approval.**
2. `docs/decisions.md`: research, positioning, pricing and naming decisions. Don't reopen them without a reason.
3. `brand/BRAND.md`: voice, logo, colour, type and component rules. All UI follows it.

## Where things stand

- Repo is new. Brand and final logo are done; no app code yet.
- Phase 1 architecture proposal is written in `docs/architecture.md` and **awaits approval**. Next after approval: Phase 2.
- Domains qrfinity.com, qrfinity.link and qrfinity.ca are registered. Exact-name trademark searches (USPTO, CIPO) came back clear.

## Non-negotiables

- Codes never expire. Never build anything that deactivates, pauses or meters a free user's code (owner-initiated pause excepted).
- Free features never move behind a paywall. Paid plans only add new capabilities.
- Static generation is fully client-side; no sign-up for static codes.
- The redirect service runs on qrfinity.link, isolated from qrfinity.com.
- Abuse protection (URL-reputation checks, reporting, admin disable) ships before public launch.
- No ads on the generator, dashboard or redirects. No raw IP storage.

## Stack and conventions

- Next.js (App Router) + TypeScript + Tailwind + Zustand. Cloudflare preferred for hosting, Workers, KV, D1 and Analytics Engine (confirm in Phase 1).
- Design tokens: `brand/tokens.json` is the source of truth. Regenerate CSS with `python3 brand/scripts/build-tokens-css.py brand/tokens.json ./fonts/ > brand/tokens.css`. Map Tailwind theme values to the CSS variables (`var(--evergreen)` etc.); never hard-code hex values in components.
- Fonts are self-hosted from `brand/fonts/` (SIL OFL 1.1). Logos and app icons are in `brand/logo/`.
- Copy: sentence case, plain words, no emoji in UI, spell the name **QRfinity**.
- SEO pages are statically rendered, content in MDX, each with unique copy (see Phase 5 of the plan).
