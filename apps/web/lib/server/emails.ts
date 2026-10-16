import type { Email } from '@qrfinity/core'
import tokens from '../../../../brand/tokens.json'

/**
 * Transactional emails. One layout for all of them, built for the lowest common denominator:
 * tables for layout, inline styles, a VML button for Outlook on Windows, a PNG logo (Gmail and
 * Outlook don't show SVG) and system fonts. Colours come straight from the token source, because
 * email can't read CSS variables.
 */

type Theme = 'light' | 'dark'
const color = (name: string, theme: Theme = 'light') => {
  const t = tokens.color.tokens.find((c) => c.name === name)
  if (!t) throw new Error(`Unknown colour token ${name}`)
  return typeof t.value === 'string' ? t.value : t.value[theme]
}

const C = {
  ground: color('ground'),
  surface: color('surface'),
  ink: color('ink'),
  muted: color('ink-muted'),
  hairline: color('hairline'),
  evergreen: color('evergreen'),
  onEvergreen: color('on-evergreen'),
  mint: color('mint'),
}
const D = {
  ground: color('ground', 'dark'),
  surface: color('surface', 'dark'),
  ink: color('ink', 'dark'),
  muted: color('ink-muted', 'dark'),
  hairline: color('hairline', 'dark'),
  mint: color('mint', 'dark'),
  evergreen: color('evergreen', 'dark'),
}

// Brand fonts first for clients that have them installed (Apple Mail); system fonts otherwise.
const SANS = `Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
const MONO = `'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace`

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Trusted HTML for the body. Everything user-supplied goes through `escapeHtml` first. */
type Html = string

export const p = (html: Html, opts: { muted?: boolean; small?: boolean } = {}) =>
  `<p class="${opts.muted ? 'muted' : 'ink'}" style="margin:0 0 16px;font-family:${SANS};font-size:${opts.small ? '14px' : '16px'};line-height:${opts.small ? '22px' : '26px'};color:${opts.muted ? C.muted : C.ink};">${html}</p>`

export const link = (href: string, text: string) =>
  `<a href="${escapeHtml(href)}" class="link" style="color:${C.evergreen};font-weight:700;text-decoration:underline;">${escapeHtml(text)}</a>`

/** A bulletproof button: VML for Outlook on Windows, a padded link everywhere else. */
export function button(href: string, label: string): Html {
  const h = escapeHtml(href)
  const l = escapeHtml(label)
  const width = Math.max(160, l.length * 10 + 56)
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
<tr><td align="left">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${h}" style="height:48px;v-text-anchor:middle;width:${width}px;" arcsize="21%" stroke="f" fillcolor="${C.evergreen}">
<w:anchorlock/>
<center style="color:${C.onEvergreen};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${l}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${h}" class="button" style="display:inline-block;background-color:${C.evergreen};color:${C.onEvergreen};font-family:${SANS};font-size:16px;font-weight:700;line-height:24px;text-decoration:none;padding:12px 28px;border-radius:10px;mso-hide:all;">${l}</a>
<!--<![endif]-->
</td></tr>
</table>`
}

/** A labelled list of facts on a mint panel, like the code an email is about. */
export function facts(rows: { label: string; value: string; mono?: boolean }[]): Html {
  const cells = rows
    .map(
      (
        r,
        i,
      ) => `<tr><td class="muted" style="padding:${i ? '12px' : '0'} 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">${escapeHtml(r.label)}</td></tr>
<tr><td class="ink" style="padding:2px 0 0;font-family:${r.mono ? MONO : SANS};font-size:${r.mono ? '14px' : '16px'};line-height:24px;font-weight:700;color:${C.ink};word-wrap:break-word;-ms-word-break:break-all;">${escapeHtml(r.value)}</td></tr>`,
    )
    .join('\n')
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td class="panel" bgcolor="${C.mint}" style="background-color:${C.mint};border-radius:12px;padding:16px 20px;">
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${cells}</table>
</td></tr>
</table>`
}

type Layout = {
  siteUrl: string
  /** Shown in the inbox list after the subject; never shown in the email itself. */
  preheader: string
  heading: string
  body: Html
  /** One line under the footer links saying why this email was sent. */
  reason: string
}

/** The shared frame: evergreen header with the logo, white card, footer with links. */
export function layout(opts: Layout): string {
  // Outlook for Windows treats px line heights loosely unless told to use them exactly.
  return frame(opts).replace(/line-height:/g, 'mso-line-height-rule:exactly;line-height:')
}

function frame({ siteUrl, preheader, heading, body, reason }: Layout): string {
  const site = siteUrl.replace(/\/$/, '')
  const logo = `${site}/brand/qrfinity-logo-reversed-email.png`
  const footerLink = (path: string, text: string) =>
    `<a href="${escapeHtml(site + path)}" class="muted" style="color:${C.muted};text-decoration:underline;">${text}</a>`
  // Pads the preheader so clients don't pull body text into the inbox preview.
  const spacer = '&#8199;&#65279;&#847; '.repeat(40)

  return `<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(heading)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table,td,p,a,h1{font-family:Arial,sans-serif !important;}</style>
<![endif]-->
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .gutter { padding-left: 16px !important; padding-right: 16px !important; }
    .card-pad { padding: 32px 24px !important; }
    .head-pad { padding: 20px 24px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg { background-color: ${D.ground} !important; }
    .card { background-color: ${D.surface} !important; border-color: ${D.hairline} !important; }
    .ink { color: ${D.ink} !important; }
    .muted { color: ${D.muted} !important; }
    .panel { background-color: ${D.mint} !important; }
    .link { color: ${D.evergreen} !important; }
  }
  [data-ogsc] .card { background-color: ${D.surface} !important; }
  [data-ogsc] .ink { color: ${D.ink} !important; }
  [data-ogsc] .muted { color: ${D.muted} !important; }
  [data-ogsc] .panel { background-color: ${D.mint} !important; }
  [data-ogsc] .link { color: ${D.evergreen} !important; }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:${C.ground};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.ground};">${escapeHtml(preheader)}${spacer}</div>
<table role="presentation" class="bg" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${C.ground}" style="background-color:${C.ground};">
<tr><td align="center" class="gutter" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="600" border="0" cellpadding="0" cellspacing="0" align="center"><tr><td><![endif]-->
<table role="presentation" class="container" width="600" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:separate;">

<tr><td class="head-pad" bgcolor="${C.evergreen}" style="background-color:${C.evergreen};border-radius:16px 16px 0 0;padding:24px 40px;">
<a href="${escapeHtml(site)}" style="text-decoration:none;"><img src="${escapeHtml(logo)}" width="122" height="32" alt="QRfinity" style="display:block;width:122px;height:32px;border:0;color:${C.onEvergreen};font-family:${SANS};font-size:20px;font-weight:700;line-height:32px;"></a>
</td></tr>

<tr><td class="card card-pad" bgcolor="${C.surface}" style="background-color:${C.surface};border:1px solid ${C.hairline};border-top:0;border-radius:0 0 16px 16px;padding:40px;">
<h1 class="ink" style="margin:0 0 16px;font-family:${SANS};font-size:24px;line-height:32px;font-weight:800;color:${C.ink};">${escapeHtml(heading)}</h1>
${body}
</td></tr>

<tr><td class="gutter" style="padding:24px 40px 0;">
<p class="muted" style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">QRfinity: QR codes that never expire.</p>
<p class="muted" style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">${footerLink('/', 'qrfinity.com')} &nbsp;·&nbsp; ${footerLink('/privacy', 'Privacy')} &nbsp;·&nbsp; ${footerLink('/terms', 'Terms')}</p>
<p class="muted" style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">${escapeHtml(reason)}</p>
<p class="muted" style="margin:0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">Teknoffice Technologies Inc., Canada</p>
</td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`
}

/** The plain-text part: same words, links written out. */
function textFooter(siteUrl: string, reason: string) {
  const site = siteUrl.replace(/\/$/, '')
  return `\n\n--\nQRfinity: QR codes that never expire.\n${site}\n${reason}\nTeknoffice Technologies Inc., Canada`
}

export function magicLinkEmail(to: string, url: string, siteUrl: string): Email {
  const reason =
    'You got this email because someone asked to sign in to QRfinity with this address.'
  return {
    to,
    subject: 'Your QRfinity sign-in link',
    text:
      `Sign in to QRfinity:\n\n${url}\n\nThe link works once and expires in 10 minutes. If you didn't ask for it, ignore this email: nobody can sign in without it.` +
      textFooter(siteUrl, reason),
    html: layout({
      siteUrl,
      preheader: 'The link works once and expires in 10 minutes.',
      heading: 'Sign in to QRfinity',
      body: [
        p('Use the button below to sign in. No password needed.'),
        button(url, 'Sign in'),
        p('The link works once and expires in 10 minutes.', { muted: true, small: true }),
        // Outlook for Windows can't wrap a long URL and would stretch the email; its VML button works.
        '<!--[if !mso]><!-->',
        p(
          `If the button doesn’t work, paste this link into your browser:<br><a href="${escapeHtml(url)}" class="link" style="color:${C.evergreen};font-family:${MONO};font-size:13px;line-height:20px;word-break:break-all;word-wrap:break-word;-ms-word-break:break-all;">${escapeHtml(url)}</a>`,
          { muted: true, small: true },
        ),
        '<!--<![endif]-->',
        p('Didn’t ask for this? Ignore this email. Nobody can sign in without the link.', {
          muted: true,
          small: true,
        }),
      ].join('\n'),
      reason,
    }),
  }
}

export function codeDisabledEmail(opts: {
  to: string
  name: string
  shortLink: string
  destination: string | null
  reason: string
  abuseEmail: string
  siteUrl: string
}): Email {
  const { to, name, shortLink, destination, reason, abuseEmail, siteUrl } = opts
  const site = siteUrl.replace(/\/$/, '')
  const why = 'You got this email because a QR code on your QRfinity account changed.'
  return {
    to,
    subject: `We turned off your QR code “${name}”`,
    text:
      `We turned off your dynamic QR code "${name}" (${shortLink}).\n\nReason: ${reason}\n\nScans now show a warning page instead of ${destination ?? 'the destination'}. If you think this is a mistake, write to ${abuseEmail} and we'll review it.\n\nOur acceptable use policy: ${site}/acceptable-use` +
      textFooter(siteUrl, why),
    html: layout({
      siteUrl,
      preheader: `Scans of “${name}” now show a warning page. Here’s why.`,
      heading: 'We turned off one of your QR codes',
      body: [
        p(
          'We turned off this dynamic QR code because it broke our acceptable use policy. Scans now show a warning page instead of the destination.',
        ),
        facts([
          { label: 'Code', value: name },
          { label: 'Short link', value: shortLink, mono: true },
          { label: 'Reason', value: reason },
        ]),
        p(
          `Think this is a mistake? Write to ${link(`mailto:${abuseEmail}`, abuseEmail)} and we’ll review it.`,
        ),
        p(`Read our ${link(`${site}/acceptable-use`, 'acceptable use policy')}.`, {
          muted: true,
          small: true,
        }),
      ].join('\n'),
      reason: why,
    }),
  }
}
