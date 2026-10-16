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
label{display:block;font-weight:600;margin:0 0 6px}
input{box-sizing:border-box;width:100%;min-height:48px;padding:10px 12px;border:1.5px solid ${C.hairline};border-radius:8px;font:inherit;color:${C.ink};background:#fff}
input:focus{outline:2px solid ${C.evergreen};outline-offset:2px}
button{width:100%;min-height:48px;margin-top:12px;border:0;border-radius:8px;background:${C.evergreen};color:#fff;font:inherit;font-weight:700;cursor:pointer}
.err{color:${C.ink};margin:12px 0 0}
.err::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:${C.warn};margin-right:8px}
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

/**
 * Asked before a password-protected code opens. The form posts back to the same short link; there
 * are no cookies, so the password is asked on every scan.
 */
export function passwordPage(
  siteOrigin: string,
  slug: string,
  opts: { error?: 'wrong' | 'slow-down'; vcf?: boolean } = {},
) {
  const message =
    opts.error === 'wrong'
      ? '<p class="err" role="alert">That password isn’t right. Try again.</p>'
      : opts.error === 'slow-down'
        ? '<p class="err" role="alert">Too many tries. Wait a minute, then try again.</p>'
        : ''
  return page({
    title: 'Password needed',
    heading: 'This QR code is protected',
    body: `<p>Its owner added a password. Enter it to continue.</p>
<form method="post" action="/${esc(encodeURIComponent(slug))}${opts.vcf ? '.vcf' : ''}">
<label for="pw">Password</label>
<input id="pw" name="password" type="password" autocomplete="off" required maxlength="64" autofocus>
<button type="submit">Continue</button>${message}
</form>`,
    siteOrigin,
    slug,
  })
}
