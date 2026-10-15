# QRfinity brand

QRfinity is a free QR code generator whose codes never expire. Every surface exists to make one promise believable: **print it once, it works forever**. Calm, plain and trustworthy beats flashy.

## The promise (say it the same way everywhere)

- Static codes: free, unlimited, no sign-up, never expire.
- Dynamic codes: free, unlimited, with scan analytics, and they never stop working. A free account is only needed to edit the destination.
- No watermark, no forced branding, every export format free.
- We never move a free feature behind a paywall. Paid plans only add new things.

Short fact block, reused word for word on the homepage, pricing and alternatives pages:

> QRfinity is a free QR code generator. Static and dynamic codes are unlimited, include scan analytics, and never expire. No watermark, no trial, every format free (PNG, SVG, PDF).

## Content fundamentals

**Voice:** honest, plain-spoken, a little defiant toward bait-and-switch generators. Confident, never smug. We name the problem ("other 'free' codes stop working after 7 days") and state our answer once, without exclamation marks.

- Write to the reader as "you"; the company is "we". One idea per sentence.
- Sentence case for every heading, button and label: "Download PNG", not "Download PNG File" or "DOWNLOAD".
- Use numbers, not adjectives: "works with every phone camera", "up to 4,000 px", "free forever". Never "amazing", "powerful", "seamless", "revolutionary".
- No fine print. If something has a limit, say the limit next to the feature, in `body-small`.
- No emoji in product UI or headings. Icons do that job.
- Spell it **QRfinity**: capital Q and R, lowercase "finity", one word. Never "QR Finity", "Qrfinity" or "QRFINITY".
- When we mention competitors, be factual and sourced. Never mock them.

Examples:

| Do | Don't |
| --- | --- |
| QR codes that never expire. | The world's most powerful QR platform! |
| Print it once. It works forever. | Unlock unlimited possibilities 🚀 |
| Free forever. No trial, no watermark. | Start your free trial today |
| This code won't scan: the logo covers too much. Make it smaller. | Error 422: invalid configuration |

## Logo

The mark is two QR finder "eyes" fused at a shared wall, forming an infinity loop. The right eye's centre is the `signal` yellow dot: the one spark of colour.

- `brand/logo/qrfinity-logo.svg` (mark + wordmark): default, on `ground` or `surface`.
- `qrfinity-logo-reversed`: on `evergreen` or any dark photo. Wordmark in `on-evergreen`, dot stays `signal`.
- `qrfinity-logo-mono`: single-ink `ink` for print, embossing, fax-quality contexts.
- `qrfinity-mark` / `qrfinity-mark-reversed` / `qrfinity-mark-mono`: the mark alone, when the name is already on screen (app header on mobile, social avatars).
- `qrfinity-app-icon`: favicon, PWA and app icon. Never redraw it at other proportions.

Rules: clear space around the logo equals the height of one inner dot (one third of the mark's height). Minimum size: mark 24 px tall on screen, 8 mm in print. Never recolour the dot, rotate, outline, add shadows or set the wordmark in another font. The wordmark is outlined Bricolage Grotesque 800; never retype it.

## Colour

- Lead with `ground` and `ink`. Evergreen is the brand, used with restraint: primary buttons, links, the logo, active states.
- `signal` yellow is a spark, not a theme: at most one yellow element per screen (usually the Download button). Text on it is always `on-signal`.
- `mint` marks good news and selection: the "Never expires" badge, selected rows, info panels. Text on it is `ink`.
- Body text is `ink`; secondary text is `ink-muted`. Both pass 4.5:1 on `ground`, `surface` and `surface-sunk` in both themes.
- Separate with `hairline` borders before reaching for `shadow-card`. Input and control borders use `control-border` (3:1).
- Scan check status: `scan-pass` with a check icon and the word "Scans"; `scan-fail` (orange, not red) with a warning icon and plain words saying what to fix. Never colour alone.
- No gradients, no blue or purple, no glassmorphism. Solid colour only.

Dark theme swaps every token automatically; never hard-code a hex in product code.

## Typography

- Headlines: Bricolage Grotesque (`display` family). `display-xl` for the homepage hero only, `display-l` for page H1s, `heading` for H2s. Tight tracking, sentence case.
- Everything else: Manrope (`sans` family). `body` for copy, `body-small` for helper text, `label` for form labels and badges, `button` for buttons, `subheading` for H3 and the promise line under an H1.
- Short links, slugs, hex codes and file sizes: JetBrains Mono (`mono`).
- Line length 60–75 characters for reading copy. Never set paragraphs in the display face.

## Layout and spacing

- 4 px base grid: `space-1` … `space-16`. Cards pad `space-4` on mobile and `space-6` on desktop. Sections are `space-8` apart on mobile, `space-12` on desktop.
- Page max width 1200 px; reading columns max 720 px. 16 px side gutter on phones, no horizontal scroll.
- The generator is the hero: on desktop, inputs left and the live QR preview right in a `surface-sunk` well with `radius-xl`. On mobile, the preview stays visible (sticky) while editing.

## Shape

- Corners echo the rounded QR modules: `radius-md` for buttons and inputs, `radius-lg` for cards, `radius-xl` for the preview well, `radius-pill` for badges.
- Focus: a 2 px solid `focus` ring with a 2 px offset on every interactive element. Never remove it.

## Iconography

- Lucide icons (outline, 1.75 px stroke, 20 px default, 16 px in badges), coloured with the text colour they sit beside.
- Status icons: `check` for Scans, `triangle-alert` for warnings, `infinity` for the never-expires promise.
- No emoji, no 3D icons, no illustrations of people. Product screenshots and real QR codes are our imagery.

## Imagery

- Show real QR codes in real places: a café table tent, a product box, a business card. Natural light, calm backgrounds, the code always scannable in the photo.
- Generated example codes in marketing must actually scan and point to qrfinity.com.

## Components

- **Button**: primary (`evergreen`), download (`signal`, one per screen), secondary (outlined with `control-border`). `radius-md`, `button` text, 44 px minimum height.
- **ScanCheck**: the live "Scans" / "Won't scan" badge under the QR preview.
- **CodeTypeBadge**: "Static" or "Dynamic" pill on every generated code, plus the "Never expires" pill in `mint`.

## Domains

- `qrfinity.com`: the site and app.
- `qrfinity.link`: dynamic-code redirects only. Never used in marketing copy except as the visible short link (`qrfinity.link/k7Ta9Q`, set in `mono`).
