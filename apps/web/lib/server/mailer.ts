import type { Email, Mailer } from '@qrfinity/core'
import { env } from './env'

/** Sends through Resend's HTTP API (no SDK, so it runs on any host). */
export class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}
  async send(email: Email) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    })
    if (!res.ok) throw new Error(`Resend responded ${res.status}`)
  }
}

type Stored = Email & { at: number }
const g = globalThis as unknown as { __qrfinityMailbox?: Stored[] }

/** Development and tests: keeps the last 50 emails in memory. */
export class DevMailbox implements Mailer {
  async send(email: Email) {
    g.__qrfinityMailbox ??= []
    g.__qrfinityMailbox.unshift({ ...email, at: Date.now() })
    g.__qrfinityMailbox.length = Math.min(g.__qrfinityMailbox.length, 50)
    console.info(`[dev mailbox] To ${email.to}: ${email.subject}\n${email.text}`)
  }
  static messagesFor(to: string): Stored[] {
    return (g.__qrfinityMailbox ?? []).filter((m) => m.to.toLowerCase() === to.toLowerCase())
  }
}

export function getMailer(): Mailer {
  if (env.devMailbox) return new DevMailbox()
  if (env.resendApiKey) return new ResendMailer(env.resendApiKey, env.emailFrom)
  throw new Error('No email provider configured. Set RESEND_API_KEY (or DEV_MAILBOX=1 locally).')
}

export function magicLinkEmail(to: string, url: string): Email {
  return {
    to,
    subject: 'Your QRfinity sign-in link',
    text: `Sign in to QRfinity:\n\n${url}\n\nThe link works once and expires in 10 minutes. If you didn't ask for it, ignore this email.`,
    html: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:26px;color:#14201a;max-width:480px">
<p>Sign in to QRfinity:</p>
<p><a href="${url}" style="display:inline-block;background:#0f5132;color:#fafaf7;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Sign in</a></p>
<p style="color:#4f5b54;font-size:14px;line-height:22px">The link works once and expires in 10 minutes. If you didn't ask for it, ignore this email.</p>
</div>`,
  }
}
