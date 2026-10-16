import type { VcardFields } from '@qrfinity/core/edge'

/**
 * The few pages the short domain ever shows. Self-contained HTML (no external assets),
 * noindex, no cookies, no scripts. Colours mirror brand/tokens.json.
 */

const C = {
  ground: '#fafaf7',
  ink: '#14201a',
  muted: '#4f5b54',
  evergreen: '#0f5132',
  hairline: '#c9cec4',
  warn: '#f29a4a',
}

function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

function page(opts: {
  title: string
  heading: string
  body: string
  siteOrigin: string
  slug?: string
  warning?: boolean
}) {
  const report = `${opts.siteOrigin}/report${opts.slug ? `?code=${encodeURIComponent(opts.slug)}` : ''}`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(opts.title)}</title>
<style>
body{margin:0;background:${C.ground};color:${C.ink};font:16px/26px system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{max-width:520px;padding:32px 16px}
h1{font-size:28px;line-height:34px;margin:0 0 12px;letter-spacing:-.4px}
p{margin:0 0 16px;color:${C.muted}}
.bar{width:48px;height:6px;border-radius:3px;background:${opts.warning ? C.warn : C.evergreen};margin-bottom:24px}
footer{margin-top:32px;padding-top:16px;border-top:1px solid ${C.hairline};font-size:14px;line-height:22px;color:${C.muted}}
a{color:${C.evergreen}}
</style></head>
<body><main><div class="bar"></div><h1>${esc(opts.heading)}</h1>${opts.body}
<footer>This short link is run by QRfinity, a free QR code generator. <a href="${esc(report)}" rel="nofollow">Report this QR code</a></footer>
</main></body></html>`
}

export function notFoundPage(siteOrigin: string, slug?: string) {
  return page({
    title: 'QR code not found',
    heading: 'This QR code isn’t active',
    body: '<p>We couldn’t find a destination for this code. Check that the whole code was scanned, or ask whoever printed it for the link.</p>',
    siteOrigin,
    slug,
  })
}

export function pausedPage(siteOrigin: string, slug: string) {
  return page({
    title: 'QR code paused',
    heading: 'This QR code is paused',
    body: '<p>Its owner has paused it for now. It will open its destination again when they turn it back on.</p>',
    siteOrigin,
    slug,
  })
}

export function disabledPage(siteOrigin: string, slug: string) {
  return page({
    title: 'QR code unavailable',
    heading: 'This QR code has been turned off',
    body: '<p>We turned off this code because its destination broke our rules, for example by phishing or spreading malware. We won’t send you there.</p><p>If you typed in a password or payment details after an earlier scan, change that password and contact your bank.</p>',
    siteOrigin,
    slug,
    warning: true,
  })
}

/** Brand colours for the contact page, light and dark (brand/tokens.json). */
const CARD = {
  light: {
    ground: '#fafaf7',
    surface: '#ffffff',
    sunk: '#eff1ea',
    ink: '#14201a',
    muted: '#4f5b54',
    hairline: '#c9cec4',
    evergreen: '#0f5132',
    onEvergreen: '#fafaf7',
    mint: '#d7ece0',
  },
  dark: {
    ground: '#0e1411',
    surface: '#151d19',
    sunk: '#1c2621',
    ink: '#eef2ee',
    muted: '#a3b0a8',
    hairline: '#3a4842',
    evergreen: '#4cc38a',
    onEvergreen: '#0e1411',
    mint: '#1f3a2d',
  },
}

const vars = (c: (typeof CARD)['light']) =>
  `--ground:${c.ground};--surface:${c.surface};--sunk:${c.sunk};--ink:${c.ink};--muted:${c.muted};--hairline:${c.hairline};--evergreen:${c.evergreen};--on-evergreen:${c.onEvergreen};--mint:${c.mint}`

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

/**
 * A dynamic contact card: name, role, and one tap to save the contact (a .vcf download) or to
 * call, email, visit or find the address. Every value is escaped; links are tel:, mailto: or
 * http(s) only.
 */
export function contactPage(siteOrigin: string, slug: string, fields: VcardFields) {
  const f = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, String(v).trim()]),
  ) as typeof fields
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

  const report = `${siteOrigin}/report?code=${encodeURIComponent(slug)}`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(name)}</title>
<meta name="color-scheme" content="light dark">
<style>
:root{${vars(CARD.light)}}
@media (prefers-color-scheme:dark){:root{${vars(CARD.dark)}}}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font:16px/26px system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:480px;margin:0 auto;padding:32px 16px}
.card{background:var(--surface);border:1px solid var(--hairline);border-radius:16px;padding:24px}
.av{width:64px;height:64px;border-radius:50%;background:var(--mint);color:var(--ink);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:24px;letter-spacing:.5px}
h1{font-size:28px;line-height:34px;margin:16px 0 4px;letter-spacing:-.4px;overflow-wrap:anywhere}
.role{margin:0;color:var(--muted)}
.save{display:flex;align-items:center;justify-content:center;min-height:48px;margin:24px 0 8px;border-radius:10px;background:var(--evergreen);color:var(--on-evergreen);font-weight:700;text-decoration:none}
.save:focus-visible,a:focus-visible{outline:2px solid var(--evergreen);outline-offset:2px}
ul{list-style:none;margin:16px 0 0;padding:0}
li{display:flex;flex-direction:column;padding:12px 0;border-top:1px solid var(--hairline)}
.k{font-size:14px;line-height:20px;color:var(--muted)}
li a{color:var(--evergreen);font-weight:600;text-decoration:none;overflow-wrap:anywhere}
.note{margin:16px 0 0;padding:12px 16px;border-radius:10px;background:var(--sunk);white-space:pre-line;overflow-wrap:anywhere}
footer{margin-top:24px;font-size:14px;line-height:22px;color:var(--muted)}
footer a{color:var(--evergreen)}
</style></head>
<body><main><div class="card">
<div class="av" aria-hidden="true">${esc(initials.slice(0, 2))}</div>
<h1>${esc(name)}</h1>${role ? `<p class="role">${esc(role)}</p>` : ''}
<a class="save" href="/${esc(encodeURIComponent(slug))}.vcf">Save contact</a>
${rows.length ? `<ul>${rows.join('')}</ul>` : ''}${f.note ? `<p class="note">${esc(f.note)}</p>` : ''}
</div>
<footer>Contact card by QRfinity, a free QR code generator. <a href="${esc(report)}" rel="nofollow">Report this page</a></footer>
</main></body></html>`
}
