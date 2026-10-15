<p><img src="brand/logo/qrfinity-logo.svg" alt="QRfinity" height="48"></p>

**QR codes that never expire.** A free QR code generator: unlimited static and dynamic codes, scan analytics, every export format, no watermark, no trial.

## Repository

| Path | What |
| --- | --- |
| `apps/web` | Next.js app (qrfinity.com): homepage generator, deployed on Vercel |
| `packages/core` | Framework-free core: content encoders, QR renderer (SVG/EPS), scan checks |
| `docs/build-plan.md` | Phased build plan (architecture → static generator → dynamic codes → abuse protection → SEO pages → monetization hooks) |
| `docs/architecture.md` | Architecture (Phase 1): Vercel app, Cloudflare redirects, Postgres, auth, DNS, costs |
| `docs/decisions.md` | Research and decisions: market, ranking strategy, costs, pricing, naming |
| `brand/BRAND.md` | Brand book: voice, logo, colour, type, spacing, components |
| `brand/tokens.json` / `brand/tokens.css` | Design tokens (light + dark) and the compiled CSS variables |
| `brand/logo/` | Logo, mark and app icon (SVG, plus PNG icons) |
| `brand/fonts/` | Self-hosted Bricolage Grotesque, Manrope, JetBrains Mono (SIL OFL 1.1) |

## Development

Requires Node 22 and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # unit tests (core: encoders, renderer decode round trips, scan checks)
pnpm test:e2e     # Playwright, builds required first: pnpm build
pnpm lint && pnpm typecheck && pnpm format:check
```

The EPS test renders through Ghostscript when `gs` is installed (CI installs it) and is skipped otherwise.

### Deploying to Vercel

Import the repository in Vercel and set **Root Directory** to `apps/web` (framework: Next.js, package manager: pnpm). No environment variables are needed yet. Pages are `noindex` until `NEXT_PUBLIC_INDEXABLE=true` is set at launch.

## Status

Brand done. Phase 1 architecture approved (`docs/architecture.md`). Phase 2, the static generator, is built and awaiting review.
