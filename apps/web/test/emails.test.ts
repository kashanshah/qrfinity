import { describe, expect, it } from 'vitest'
import { codeDisabledEmail, magicLinkEmail } from '@/lib/server/emails'

const site = 'https://qrfinity.com'

describe('emails', () => {
  it('sign-in email: plain-text link first, button for every client, PNG logo', () => {
    const url = 'https://qrfinity.com/api/auth/magic-link/verify?token=abc&callbackURL=%2Fdashboard'
    const e = magicLinkEmail('a@example.com', url, site)
    expect(e.subject).toBe('Your QRfinity sign-in link')
    // End-to-end sign-in takes the first URL in the text part.
    expect(e.text.match(/https?:\/\/\S+/)?.[0]).toBe(url)
    expect(e.html).toContain(
      'href="https://qrfinity.com/api/auth/magic-link/verify?token=abc&amp;callbackURL=%2Fdashboard"',
    )
    expect(e.html).toContain('<v:roundrect')
    expect(e.html).toContain('src="https://qrfinity.com/brand/qrfinity-logo-reversed-email.png"')
    expect(e.html).not.toMatch(/\.svg"/)
    expect(e.html).not.toContain('var(--')
    // Checked against caniemail.com: Outlook for Windows can't wrap the long URL, so it only
    // gets the VML button; exact line heights there; no chained selectors (buggy in Outlook).
    expect(e.html).toMatch(/<!--\[if !mso\]><!-->\s*<p[^>]*>If the button doesn’t work/)
    expect(e.html).toContain('word-wrap:break-word')
    expect(e.html).not.toMatch(/line-height:(?<!rule:exactly;line-height:)/)
    expect(e.html).not.toMatch(/\b[a-z0-9]+\.[a-z-]+\s*[,{]/)
  })

  it('code-disabled email escapes what users and admins typed', () => {
    const e = codeDisabledEmail({
      to: 'a@example.com',
      name: '<script>alert(1)</script>',
      shortLink: 'qrfinity.link/abc',
      destination: null,
      reason: 'Phishing "login" page',
      abuseEmail: 'abuse@qrfinity.com',
      siteUrl: `${site}/`,
    })
    expect(e.subject).toContain('<script>')
    expect(e.html).not.toContain('<script>')
    expect(e.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(e.html).toContain('Phishing &quot;login&quot; page')
    expect(e.html).toContain('href="mailto:abuse@qrfinity.com"')
    expect(e.html).toContain('href="https://qrfinity.com/acceptable-use"')
    expect(e.text).toContain('instead of the destination')
  })
})
