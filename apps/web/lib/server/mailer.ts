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
