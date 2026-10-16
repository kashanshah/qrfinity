/**
 * The contact card page, as HTML. Shared by the redirect Worker (which serves it on the short
 * domain) and the dashboard (which previews it). Self-contained: inline CSS, no scripts, no
 * external assets. Every value is escaped; links are tel:, mailto: or http(s) only.
 */
import { contrastRatio, isHexColor, normalizeHex, parseHex } from '../color'
import type { VcardFields } from '../content'

/**
 * In plan order: a plan with N templates (CONTACT_TEMPLATES_BY_PLAN) gets the first N. Classic,
 * the first, is what a page falls back to when its template isn't on the owner's plan.
 */
export const PAGE_TEMPLATES = [
  'classic',
  'centered',
  'banner',
  'minimal',
  'buttons',
  'compact',
  'spotlight',
  'elegant',
] as const
export type PageTemplate = (typeof PAGE_TEMPLATES)[number]

export const PAGE_TEMPLATE_LABEL: Record<PageTemplate, { name: string; hint: string }> = {
  classic: { name: 'Classic', hint: 'A card with your initials' },
  centered: { name: 'Centered', hint: 'Like a printed business card' },
  banner: { name: 'Banner', hint: 'A colour band across the top' },
  minimal: { name: 'Minimal', hint: 'Just your details, no card' },
  buttons: { name: 'Buttons', hint: 'A big button for each way to reach you' },
  compact: { name: 'Compact', hint: 'Labels and details side by side' },
  spotlight: { name: 'Spotlight', hint: 'Your colour behind the card' },
  elegant: { name: 'Elegant', hint: 'A serif name and fine lines' },
}

/** The template a page shows when its owner's plan includes `count` templates. */
export function templateWithin(template: PageTemplate, count: number): PageTemplate {
  return PAGE_TEMPLATES.indexOf(template) < Math.max(1, count) ? template : 'classic'
}

/** How a contact page looks. `accent` is #rrggbb, or null to match the printed code. */
export type PageStyle = { template: PageTemplate; accent: string | null }

export const DEFAULT_PAGE_STYLE: PageStyle = { template: 'classic', accent: null }

/** Brand evergreen: the accent when the code's own colour is black, grey or missing. */
export const BRAND_ACCENT = '#0f5132'

export function isPageTemplate(v: unknown): v is PageTemplate {
  return (PAGE_TEMPLATES as readonly unknown[]).includes(v)
}

export function cleanPageStyle(input: unknown): PageStyle {
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return {
    template: isPageTemplate(s.template) ? s.template : 'classic',
    accent: typeof s.accent === 'string' && isHexColor(s.accent) ? normalizeHex(s.accent) : null,
  }
}

/** A colour with some hue; black, white and greys make a dull accent. */
function hasHue(hex: string) {
  const { r, g, b } = parseHex(hex)
  return Math.max(r, g, b) - Math.min(r, g, b) > 40
}

/**
 * The accent to use: the chosen colour, else the printed code's colour if it has a hue, else
 * the brand green.
 */
export function resolveAccent(accent: string | null, codeColor?: string | null): string {
  if (accent && isHexColor(accent)) return normalizeHex(accent)
  if (codeColor && isHexColor(codeColor) && hasHue(codeColor)) return normalizeHex(codeColor)
  return BRAND_ACCENT
}

function mix(hex: string, toward: string, t: number) {
  const a = parseHex(hex)
  const b = parseHex(toward)
  const c = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0')
  return `#${c(a.r, b.r)}${c(a.g, b.g)}${c(a.b, b.b)}`
}

/** Darkens (on light) or lightens (on dark) until text in the accent is readable (4.5:1). */
export function readableAccent(accent: string, background: string): string {
  const toward =
    contrastRatio(background, '#ffffff') > contrastRatio(background, '#000000')
      ? '#ffffff'
      : '#000000'
  let out = normalizeHex(accent)
  for (let t = 0.1; contrastRatio(out, background) < 4.5 && t <= 1; t += 0.1)
    out = mix(accent, toward, t)
  return out
}

/** Text colour on an accent-coloured button or band. */
const onAccent = (accent: string) =>
  contrastRatio(accent, '#ffffff') >= contrastRatio(accent, '#14201a') ? '#ffffff' : '#14201a'

const LIGHT = {
  ground: '#fafaf7',
  surface: '#ffffff',
  sunk: '#eff1ea',
  ink: '#14201a',
  muted: '#4f5b54',
  hairline: '#c9cec4',
  mint: '#d7ece0',
}
const DARK = {
  ground: '#0e1411',
  surface: '#151d19',
  sunk: '#1c2621',
  ink: '#eef2ee',
  muted: '#a3b0a8',
  hairline: '#3a4842',
  mint: '#1f3a2d',
}

function vars(c: typeof LIGHT, accent: string) {
  const a = readableAccent(accent, c.surface)
  return `--ground:${c.ground};--surface:${c.surface};--sunk:${c.sunk};--ink:${c.ink};--muted:${c.muted};--hairline:${c.hairline};--mint:${c.mint};--accent:${a};--on-accent:${onAccent(a)}`
}

function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

const telHref = (phone: string) => {
  const t = phone.trim()
  return `tel:${(t.startsWith('+') ? '+' : '') + t.replace(/[^\d]/g, '')}`
}

const webHref = (url: string) => {
  let v = url.trim()
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = `https://${v}`
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font:16px/26px system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:480px;margin:0 auto;padding:32px 16px}
.card{background:var(--surface);border:1px solid var(--hairline);border-radius:16px;padding:24px;overflow:hidden}
.av{width:64px;height:64px;border-radius:50%;background:var(--mint);color:var(--ink);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:24px;letter-spacing:.5px;flex:none}
h1{font-size:28px;line-height:34px;margin:16px 0 4px;letter-spacing:-.4px;overflow-wrap:anywhere}
.role{margin:0;color:var(--muted)}
.save{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;margin:24px 0 8px;border:0;border-radius:10px;background:var(--accent);color:var(--on-accent);font:inherit;font-weight:700;text-decoration:none;cursor:pointer}
form.saveform{margin:0}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
ul{list-style:none;margin:16px 0 0;padding:0}
li{display:flex;flex-direction:column;padding:12px 0;border-top:1px solid var(--hairline)}
.k{font-size:14px;line-height:20px;color:var(--muted)}
li a{color:var(--accent);font-weight:600;text-decoration:none;overflow-wrap:anywhere}
.note{margin:16px 0 0;padding:12px 16px;border-radius:10px;background:var(--sunk);white-space:pre-line;overflow-wrap:anywhere}
footer{margin-top:24px;font-size:14px;line-height:22px;color:var(--muted)}
footer a{color:var(--accent)}
.t-banner .card{padding:0}
.t-banner .band{height:96px;background:var(--accent)}
.t-banner .body{padding:0 24px 24px}
.t-banner .av{width:88px;height:88px;font-size:32px;margin-top:-44px;border:4px solid var(--surface);background:var(--sunk)}
.t-centered .card{text-align:center}
.t-centered .av{margin:0 auto}
.t-centered li{align-items:center}
.t-centered .note{text-align:left}
.t-centered footer{text-align:center}
.t-minimal main{padding-top:48px}
.t-minimal .card{background:none;border:0;padding:0;border-radius:0}
.t-minimal .av{display:none}
.t-minimal h1{font-size:36px;line-height:42px;margin-top:0}
.t-minimal .role{font-size:18px}
.t-minimal .save{background:none;color:var(--accent);border:2px solid var(--accent)}
.t-minimal li{border-top:0;padding:8px 0}
.t-minimal ul{margin-top:24px;border-left:3px solid var(--accent);padding-left:16px}
.t-buttons .card{text-align:center}
.t-buttons .av{margin:0 auto}
.t-buttons ul{margin-top:8px}
.t-buttons li{border-top:0;padding:4px 0}
.t-buttons .k{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.t-buttons li a,.t-buttons li span{display:flex;align-items:center;justify-content:center;min-height:48px;padding:8px 16px;border:1.5px solid var(--accent);border-radius:10px}
.t-buttons li span{border-color:var(--hairline)}
.t-buttons footer{text-align:center}
.t-compact .head{display:flex;align-items:center;gap:16px}
.t-compact .av{width:52px;height:52px;font-size:20px}
.t-compact h1{font-size:22px;line-height:28px;margin:0}
.t-compact .save{margin-top:20px;min-height:44px}
.t-compact li{flex-direction:row;justify-content:space-between;align-items:baseline;gap:16px;padding:10px 0}
.t-compact .k{flex:none}
.t-compact li a,.t-compact li span:last-child{text-align:right}
.t-spotlight{background:var(--ground) linear-gradient(var(--accent),var(--accent)) top/100% 240px no-repeat}
.t-spotlight main{padding-top:88px}
.t-spotlight .card{border:0;box-shadow:0 12px 32px rgba(0,0,0,.18);text-align:center;overflow:visible}
.t-spotlight .av{margin:-64px auto 0;width:80px;height:80px;font-size:28px;background:var(--surface);color:var(--accent);border:4px solid var(--accent)}
.t-spotlight li{align-items:center}
.t-spotlight .note{text-align:left}
.t-elegant .card{border-radius:4px;border-top:4px solid var(--accent)}
.t-elegant .av{display:none}
.t-elegant h1{font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:34px;line-height:40px;margin-top:4px;letter-spacing:0}
.t-elegant .role{font-style:italic}
.t-elegant .save{border-radius:4px;letter-spacing:.04em}
.t-elegant .k{text-transform:uppercase;letter-spacing:.12em;font-size:12px}
.t-elegant li a{font-weight:500}
`

/** The contact page for a card. `slug` builds the .vcf and report links. */
export function renderContactPage(input: {
  fields: VcardFields
  style: PageStyle
  /** Resolved accent (see resolveAccent). */
  accent: string
  slug: string
  siteOrigin: string
  /** Previews only: show one colour scheme instead of following the device. */
  scheme?: 'light' | 'dark'
  /**
   * For a password-protected card: the password just typed. Save contact then posts it with the
   * request for the .vcf instead of linking to it, so the visitor isn't asked again.
   */
  unlock?: string
}): string {
  const f = Object.fromEntries(
    Object.entries(input.fields).map(([k, v]) => [k, String(v ?? '').trim()]),
  ) as VcardFields
  const name = [f.firstName, f.lastName].filter(Boolean).join(' ') || f.organization
  const initials =
    (f.firstName || f.lastName
      ? `${f.firstName.charAt(0)}${f.lastName.charAt(0)}`
      : f.organization.charAt(0)
    ).toUpperCase() || '?'
  const role = [f.title, f.firstName || f.lastName ? f.organization : '']
    .filter(Boolean)
    .join(' · ')
  const address = [f.street, f.city, f.region, f.postalCode, f.country].filter(Boolean).join(', ')
  const website = f.website ? webHref(f.website) : null

  const rows: string[] = []
  const row = (label: string, value: string, href: string | null) =>
    rows.push(
      `<li><span class="k">${esc(label)}</span>${
        href
          ? `<a href="${esc(href)}" rel="nofollow noopener">${esc(value)}</a>`
          : `<span>${esc(value)}</span>`
      }</li>`,
    )
  if (f.mobile) row('Mobile', f.mobile, telHref(f.mobile))
  if (f.workPhone) row('Work', f.workPhone, telHref(f.workPhone))
  if (f.email) row('Email', f.email, `mailto:${f.email}`)
  if (website) row('Website', f.website.replace(/^https?:\/\/(www\.)?/i, ''), website)
  if (address)
    row(
      'Address',
      address,
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    )

  const template = isPageTemplate(input.style.template) ? input.style.template : 'classic'
  const accent = isHexColor(input.accent) ? normalizeHex(input.accent) : BRAND_ACCENT
  const report = `${input.siteOrigin}/report?code=${encodeURIComponent(input.slug)}`
  const avatar = `<div class="av" aria-hidden="true">${esc(initials.slice(0, 2))}</div>`
  const heading = `<h1>${esc(name)}</h1>${role ? `<p class="role">${esc(role)}</p>` : ''}`
  const details = `${
    template === 'compact'
      ? `<div class="head">${avatar}<div>${heading}</div></div>`
      : `${avatar}
${heading}`
  }
${
  input.unlock !== undefined
    ? `<form class="saveform" method="post" action="/${esc(encodeURIComponent(input.slug))}.vcf"><input type="hidden" name="password" value="${esc(input.unlock)}"><button class="save" type="submit">Save contact</button></form>`
    : `<a class="save" href="/${esc(encodeURIComponent(input.slug))}.vcf">Save contact</a>`
}
${rows.length ? `<ul>${rows.join('')}</ul>` : ''}${f.note ? `<p class="note">${esc(f.note)}</p>` : ''}`

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(name)}</title>
<meta name="color-scheme" content="light dark">
<style>
${
  input.scheme
    ? `:root{${vars(input.scheme === 'dark' ? DARK : LIGHT, accent)}}`
    : `:root{${vars(LIGHT, accent)}}
@media (prefers-color-scheme:dark){:root{${vars(DARK, accent)}}}`
}
${CSS}</style></head>
<body class="t-${template}"><main><div class="card">${
    template === 'banner' ? `<div class="band"></div><div class="body">${details}</div>` : details
  }</div>
<footer>Contact card by QRfinity, a free QR code generator. <a href="${esc(report)}" rel="nofollow">Report this page</a></footer>
</main></body></html>`
}
