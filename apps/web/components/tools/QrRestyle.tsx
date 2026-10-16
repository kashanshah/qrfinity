'use client'

import { exactContent, identifyAppCode, parseContent, type AppCode } from '@qrfinity/core'
import { Info, RotateCcw, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Generator } from '@/components/generator/Generator'
import { Button } from '@/components/ui/Button'
import { track } from '@/lib/analytics'
import { QrInput } from './QrReader'

/**
 * Restyles a QR code made by an app (WeChat, WeChat Pay, Alipay): read the original in the
 * browser, then design a new code that holds exactly the same text. Always static: a code made
 * by WeChat has to reach WeChat unchanged, not through our short links.
 */
export function QrRestyle({ shortLinkBase }: { shortLinkBase: string }) {
  const [text, setText] = useState<string | null>(null)

  if (text === null) {
    return (
      <div className="flex flex-col gap-3">
        <QrInput
          heading="Add a screenshot of your WeChat or Alipay QR code"
          onFound={setText}
          onRead={(source, found) =>
            track('qr_read', {
              tool: 'restyle',
              source,
              found: found !== null,
              content_type: found === null ? null : contentKind(found),
            })
          }
        />
        <p className="body-small text-ink-muted">
          WeChat mini program codes, the round ones, aren’t QR codes, so they can’t be restyled.
        </p>
      </div>
    )
  }

  const app = identifyAppCode(text)
  const init = exactContent(text)
  return (
    <Generator
      key={text}
      init={{ kind: 'static', ...init }}
      shortLinkBase={shortLinkBase}
      contentTitle={`1. ${title(app)}`}
      fixedContent={{
        panel: <Panel text={text} app={app} onReset={() => setText(null)} />,
        note: note(app),
      }}
    />
  )
}

/** A category for analytics: never the code's content. */
function contentKind(text: string): string {
  const app = identifyAppCode(text)
  if (!app) return parseContent(text).type
  return app.app === 'wechat' ? `wechat-${app.kind}` : app.app
}

function title(app: AppCode | null): string {
  if (!app) return 'Your QR code'
  if (app.app === 'wechat-pay') return 'Your WeChat Pay code'
  if (app.app === 'alipay') return 'Your Alipay code'
  switch (app.kind) {
    case 'contact':
      return 'Your WeChat contact code'
    case 'group':
      return 'Your WeChat group code'
    case 'official-account':
      return 'Your WeChat Official Account code'
    default:
      return 'Your WeChat code'
  }
}

function note(app: AppCode | null): string {
  if (app?.app === 'wechat' && app.kind === 'group') {
    return 'This code holds exactly what your WeChat group code holds. WeChat still ends the invitation 7 days after making it; restyling can’t change that.'
  }
  return 'This code holds exactly what your original holds, so it opens the same thing in the same app. It stays valid for as long as the app keeps the original valid.'
}

function Panel({ text, app, onReset }: { text: string; app: AppCode | null; onReset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <AppNote app={app} />
      <div className="flex flex-col gap-1.5">
        <p className="label text-ink">What the code holds</p>
        <p className="mono break-all rounded-md bg-surface-sunk px-3 py-2 text-ink">{text}</p>
        <p className="body-small text-ink-muted">
          Copied exactly, character for character. Scan the new code with your phone before you
          print it.
        </p>
      </div>
      <div>
        <Button
          icon={<RotateCcw aria-hidden="true" size={18} strokeWidth={1.75} />}
          onClick={onReset}
        >
          Use a different code
        </Button>
      </div>
    </div>
  )
}

function AppNote({ app }: { app: AppCode | null }) {
  if (!app) {
    return (
      <Callout>
        This isn’t a WeChat or Alipay code, but you can restyle it all the same. If it’s a link, a
        dynamic code from the generator lets you change it later.
      </Callout>
    )
  }
  if (app.app === 'wechat-pay' || app.app === 'alipay') {
    return (
      <Callout>
        A payment code. Before you print it, scan the new code and check that the name shown is
        yours. Print it where nobody can stick another code over it.
      </Callout>
    )
  }
  if (app.kind === 'group') {
    return (
      <Callout warning>
        WeChat group codes stop working 7 days after WeChat makes them, and this copy stops with it.
        Use it for something short, like an event this week. When it expires, make a new code in
        WeChat and restyle that one.
      </Callout>
    )
  }
  return (
    <Callout>
      Scanned in WeChat, the new code opens the same{' '}
      {app.kind === 'official-account'
        ? 'Official Account'
        : app.kind === 'contact'
          ? 'contact'
          : 'page'}{' '}
      as your original.
    </Callout>
  )
}

function Callout({ warning = false, children }: { warning?: boolean; children: ReactNode }) {
  const Icon = warning ? TriangleAlert : Info
  return (
    <p className="body-small flex items-start gap-2 rounded-md border border-hairline bg-surface-sunk px-3 py-2 text-ink">
      <Icon aria-hidden="true" size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
