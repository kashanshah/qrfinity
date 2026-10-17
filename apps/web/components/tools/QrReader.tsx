'use client'

import {
  canBeDynamic,
  identifyQrService,
  isQrfinityLink,
  parseContent,
  SHORTENER_DOMAINS,
  type ParsedContent,
} from '@qrfinity/core'
import {
  Camera,
  CircleCheck,
  Copy,
  ExternalLink,
  Info,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { CONTENT_TYPE_OPTIONS, PAYMENT_LABELS } from '@/components/generator/ContentForm'
import { Generator } from '@/components/generator/Generator'
import { Button } from '@/components/ui/Button'
import { track } from '@/lib/analytics'
import { decodeImageFile, decodeVideoFrame } from '@/lib/scan'
import type { LinkCheck } from '@/lib/server/link-check'

type Mode = 'scanner' | 'checker'

type Phase = { s: 'idle' } | { s: 'reading' } | { s: 'camera' } | { s: 'none'; message: string }

/**
 * Reads a QR code from an image, a pasted screenshot or the camera, entirely in the browser, and
 * shows what it holds. Used by the scanner and the checker; the checker leads with why a code
 * might have stopped working. Only the optional link check talks to our server.
 */
export function QrReader({ mode, shortLinkBase }: { mode: Mode; shortLinkBase: string }) {
  const [text, setText] = useState<string | null>(null)
  if (text !== null) {
    return (
      <Result text={text} mode={mode} shortLinkBase={shortLinkBase} onReset={() => setText(null)} />
    )
  }
  return (
    <QrInput
      heading={
        mode === 'checker'
          ? 'Add a photo or screenshot of the QR code that stopped working'
          : 'Add a photo or screenshot of a QR code'
      }
      onFound={setText}
      onRead={(source, found) => report(mode, source, found)}
    />
  )
}

/**
 * The image, paste and camera input shared by the QR tools. Everything is decoded in the
 * browser; `onFound` gets the text inside the code.
 */
export function QrInput({
  heading,
  onFound,
  onRead,
  analyze,
}: {
  heading: string
  onFound: (text: string) => void
  /** Every read attempt, found or not (for analytics). */
  onRead?: (source: 'image' | 'camera', text: string | null) => void
  /**
   * Takes over reading the image (the tester measures the design, not just the text): resolves
   * to the code's text, or null when there's none. Hides the camera, which can't test a design.
   */
  analyze?: (file: Blob) => Promise<string | null>
}) {
  const [phase, setPhase] = useState<Phase>({ s: 'idle' })
  const fileInput = useRef<HTMLInputElement>(null)
  const inputId = useId()

  const readFile = useCallback(
    async (file: Blob) => {
      if (!file.type.startsWith('image/')) {
        setPhase({ s: 'none', message: 'That isn’t an image. Choose a photo or a screenshot.' })
        return
      }
      setPhase({ s: 'reading' })
      try {
        const text = analyze ? await analyze(file) : await decodeImageFile(file)
        onRead?.('image', text)
        if (text === null) {
          setPhase({
            s: 'none',
            message:
              'We couldn’t find a QR code in that image. Try a sharper photo, taken straight on, with the whole code in view.',
          })
        } else {
          setPhase({ s: 'idle' })
          onFound(text)
        }
      } catch {
        setPhase({ s: 'none', message: 'That image couldn’t be opened. Try a JPG or PNG.' })
      }
    },
    [onFound, onRead, analyze],
  )

  // Paste a screenshot anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (file) {
        e.preventDefault()
        void readFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [readFile])

  if (phase.s === 'camera') {
    return (
      <CameraScan
        onFound={(text) => {
          onRead?.('camera', text)
          setPhase({ s: 'idle' })
          onFound(text)
        }}
        onCancel={(message) => setPhase(message ? { s: 'none', message } : { s: 'idle' })}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-control-border bg-surface px-4 py-10 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file) void readFile(file)
        }}
      >
        <p className="subheading text-ink">{heading}</p>
        <p className="body-small max-w-[48ch] text-ink-muted">
          {analyze
            ? 'Drop your design here (PNG, JPG or a screenshot), or paste it. It’s tested in your browser and never uploaded.'
            : 'Drop an image here, paste a screenshot, or use your camera. The image is read in your browser and never uploaded.'}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            variant="primary"
            icon={<Upload aria-hidden="true" size={18} strokeWidth={1.75} />}
            onClick={() => fileInput.current?.click()}
          >
            Choose an image
          </Button>
          {analyze ? null : (
            <Button
              icon={<Camera aria-hidden="true" size={18} strokeWidth={1.75} />}
              onClick={() => setPhase({ s: 'camera' })}
            >
              Use the camera
            </Button>
          )}
        </div>
        <label htmlFor={inputId} className="sr-only">
          QR code image
        </label>
        <input
          ref={fileInput}
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void readFile(file)
          }}
        />
      </div>
      <p role="status" aria-live="polite" className="body-small text-ink-muted empty:hidden">
        {phase.s === 'reading' ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle
              aria-hidden="true"
              size={16}
              strokeWidth={1.75}
              className="motion-safe:animate-spin"
            />
            Reading the code…
          </span>
        ) : phase.s === 'none' ? (
          <span className="inline-flex items-start gap-2 text-ink">
            <TriangleAlert
              aria-hidden="true"
              size={16}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0"
            />
            {phase.message}
          </span>
        ) : null}
      </p>
    </div>
  )
}

function report(tool: Mode, source: 'image' | 'camera', text: string | null) {
  track('qr_read', {
    tool,
    input: source,
    found: text !== null,
    content_type: text === null ? null : parseContent(text).type,
  })
}

// ---------------------------------------------------------------------------
// Camera

function CameraScan({
  onFound,
  onCancel,
}: {
  onFound: (text: string) => void
  onCancel: (message?: string) => void
}) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const stop = () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
    const tick = async () => {
      const v = video.current
      if (stopped || !v) return
      if (v.readyState >= 2 && v.videoWidth) {
        const text = await decodeVideoFrame(v).catch(() => null)
        if (text !== null && !stopped) {
          stop()
          return onFound(text)
        }
      }
      if (!stopped) timer = setTimeout(tick, 250)
    }
    const noCamera = 'No camera is available here. Choose an image instead.'
    if (!navigator.mediaDevices?.getUserMedia) {
      onCancel(noCamera)
      return stop
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
        void tick()
      })
      .catch((e: DOMException) =>
        onCancel(
          e?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser’s settings, or choose an image instead.'
            : noCamera,
        ),
      )
    return stop
    // Start once; the callbacks only change with the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-[480px] overflow-hidden rounded-xl bg-ink">
        <video
          ref={video}
          muted
          playsInline
          aria-label="Camera view"
          className="aspect-square w-full object-cover"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-on-evergreen/80"
        />
      </div>
      <p role="status" aria-live="polite" className="body-small text-ink-muted">
        Point the camera at the QR code. It’s read on this device; nothing is recorded.
      </p>
      <Button onClick={() => onCancel()}>Cancel</Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result

export const TYPE_LABEL = Object.fromEntries(CONTENT_TYPE_OPTIONS.map((o) => [o.value, o.label]))

/** The code's content as label/value rows, in the words the generator uses. */
export function details(p: ParsedContent): [string, string][] {
  const rows = (pairs: [string, string | undefined][]) =>
    pairs.filter((r): r is [string, string] => Boolean(r[1]?.trim()))
  switch (p.type) {
    case 'url':
      return rows([['Link', p.fields.url]])
    case 'text':
      return rows([['Text', p.fields.text]])
    case 'wifi':
      return rows([
        ['Network', p.fields.ssid],
        ['Password', p.fields.password || 'None'],
        ['Security', p.fields.encryption === 'nopass' ? 'Open network' : p.fields.encryption],
        ['Hidden network', p.fields.hidden ? 'Yes' : undefined],
      ])
    case 'vcard': {
      const f = p.fields
      return rows([
        ['Name', [f.firstName, f.lastName].filter(Boolean).join(' ')],
        ['Organization', f.organization],
        ['Title', f.title],
        ['Mobile', f.mobile],
        ['Work phone', f.workPhone],
        ['Email', f.email],
        ['Website', f.website],
        [
          'Address',
          [f.street, f.city, f.region, f.postalCode, f.country].filter(Boolean).join(', '),
        ],
        ['Note', f.note],
      ])
    }
    case 'email':
      return rows([
        ['To', p.fields.to],
        ['Subject', p.fields.subject],
        ['Message', p.fields.body],
      ])
    case 'sms':
      return rows([
        ['Number', p.fields.phone],
        ['Message', p.fields.message],
      ])
    case 'phone':
      return rows([['Number', p.fields.phone]])
    case 'whatsapp':
      return rows([
        ['Number', p.fields.phone],
        ['Message', p.fields.message],
      ])
    case 'location':
      return p.fields.mode === 'address'
        ? rows([['Place', p.fields.address]])
        : rows([['Coordinates', `${p.fields.latitude}, ${p.fields.longitude}`]])
    case 'event':
      return rows([
        ['Event', p.fields.title],
        ['Starts', p.fields.start.replace('T', ' ')],
        ['Ends', p.fields.end.replace('T', ' ')],
        ['Where', p.fields.location],
        ['Details', p.fields.description],
      ])
    case 'app':
      return rows([
        ['Store', p.fields.store === 'ios' ? 'App Store' : 'Google Play'],
        ['Link', p.fields.url],
      ])
    case 'social':
      return rows([['Profile', p.fields.handle]])
    case 'payment':
      return rows([
        ['Pay with', PAYMENT_LABELS[p.fields.method]],
        [
          p.fields.method === 'pix' ? 'Pix key' : p.fields.method === 'upi' ? 'UPI ID' : 'Account',
          p.fields.account,
        ],
        ['Name', p.fields.name],
        ['City', p.fields.city],
        ['Amount', p.fields.amount],
        ['Note', p.fields.note],
      ])
  }
}

type CheckState =
  | { s: 'idle' }
  | { s: 'checking' }
  | { s: 'done'; result: LinkCheck }
  | { s: 'error'; message: string }

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Result({
  text,
  mode,
  shortLinkBase,
  onReset,
}: {
  text: string
  mode: Mode
  shortLinkBase: string
  onReset: () => void
}) {
  const parsed = useMemo(() => parseContent(text), [text])
  const link = /^https?:\/\//i.test(text.trim()) ? text.trim() : null
  const host = link ? hostOf(link) : ''
  const service = link ? identifyQrService(link) : null
  const ours = link ? isQrfinityLink(link, [hostOf(shortLinkBase)]) : false
  const shortener =
    !!link &&
    !service &&
    !ours &&
    SHORTENER_DOMAINS.some((d) => host === d || host.endsWith('.' + d) || link.includes(`//${d}/`))
  const [check, setCheck] = useState<CheckState>({ s: 'idle' })
  const [replace, setReplace] = useState(false)
  const [copied, setCopied] = useState(false)

  const runCheck = async () => {
    if (!link) return
    setCheck({ s: 'checking' })
    try {
      const res = await fetch('/api/tools/check-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link }),
      })
      const body = (await res.json()) as LinkCheck | { error: string }
      if ('error' in body) return setCheck({ s: 'error', message: body.error })
      track('link_checked', { tool: mode, outcome: body.outcome, known_service: !!service })
      setCheck({ s: 'done', result: body })
    } catch {
      setCheck({ s: 'error', message: 'The check couldn’t run. Try again in a moment.' })
    }
  }

  // The replacement starts from the best address we know: where a working redirect ends up.
  const finalUrl =
    check.s === 'done' && check.result.outcome === 'works' ? check.result.finalUrl : ''
  const redirects = !!service || shortener
  const init = redirects
    ? { type: 'url' as const, fields: { url: { url: finalUrl } }, kind: 'dynamic' as const }
    : {
        type: parsed.type,
        fields: { [parsed.type]: parsed.fields },
        kind:
          mode === 'checker' && canBeDynamic(parsed.type, parsed.fields)
            ? ('dynamic' as const)
            : ('static' as const),
      }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-hairline bg-surface p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="subheading text-ink">
            {parsed.type === 'text'
              ? 'This code holds text'
              : `This code holds a ${TYPE_LABEL[parsed.type]?.toLowerCase() === 'wi-fi' ? 'Wi-Fi network' : TYPE_LABEL[parsed.type]?.toLowerCase()}`}
          </h2>
          <Button
            icon={<RotateCcw aria-hidden="true" size={16} strokeWidth={1.75} />}
            onClick={onReset}
          >
            Read another code
          </Button>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          {details(parsed).map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="body-small text-ink-muted">{label}</dt>
              <dd className="whitespace-pre-wrap break-all text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <Notes
          mode={mode}
          parsed={parsed}
          link={link}
          host={host}
          service={service}
          ours={ours}
          shortener={shortener}
        />

        <div className="mt-5 flex flex-wrap gap-3">
          {link ? (
            <Button
              variant={mode === 'checker' ? 'primary' : 'secondary'}
              disabled={check.s === 'checking'}
              icon={
                check.s === 'checking' ? (
                  <LoaderCircle
                    aria-hidden="true"
                    size={18}
                    strokeWidth={1.75}
                    className="motion-safe:animate-spin"
                  />
                ) : (
                  <CircleCheck aria-hidden="true" size={18} strokeWidth={1.75} />
                )
              }
              onClick={runCheck}
            >
              {check.s === 'checking' ? 'Checking the link…' : 'Check if the link still works'}
            </Button>
          ) : null}
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="button inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-[1.5px] border-control-border bg-surface px-6 py-3 text-ink transition-colors hover:bg-surface-sunk"
            >
              <ExternalLink aria-hidden="true" size={18} strokeWidth={1.75} />
              Open the link
            </a>
          ) : null}
          <Button
            icon={<Copy aria-hidden="true" size={18} strokeWidth={1.75} />}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              } catch {
                // Clipboard blocked: the raw text below can still be selected.
              }
            }}
          >
            {copied ? 'Copied' : 'Copy what’s in the code'}
          </Button>
        </div>
        {link ? (
          <p className="body-small mt-2 text-ink-muted">
            The check sends the link to QRfinity, which opens it and reports back. We don’t keep it.
          </p>
        ) : null}

        <div role="status" aria-live="polite" className="empty:hidden">
          {check.s === 'done' ? <CheckOutcome result={check.result} /> : null}
          {check.s === 'error' ? (
            <p className="mt-4 text-ink">
              <TriangleAlert
                aria-hidden="true"
                size={16}
                strokeWidth={1.75}
                className="mr-1 inline align-[-3px]"
              />
              {check.message}
            </p>
          ) : null}
        </div>

        <details className="mt-5">
          <summary className="body-small cursor-pointer text-ink-muted">
            Exactly what’s in the code
          </summary>
          <pre className="mono mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface-sunk p-3 text-ink">
            {text}
          </pre>
        </details>
      </div>

      <section aria-labelledby="replacement" className="flex flex-col gap-4">
        <div>
          <h2 id="replacement" className="heading text-ink">
            {mode === 'checker' ? 'Make a replacement that never expires' : 'Make your own copy'}
          </h2>
          <p className="mt-1 max-w-[65ch] text-ink-muted">
            {redirects
              ? 'Enter where the code should go. A dynamic code lets you change that address after printing, free, and it never expires.'
              : 'We’ve filled in the same content. Codes made on QRfinity never expire.'}
          </p>
        </div>
        {replace ? (
          <Generator
            key={finalUrl}
            init={init}
            kindChoice={redirects || canBeDynamic(parsed.type, parsed.fields)}
            shortLinkBase={shortLinkBase}
          />
        ) : (
          <div>
            <Button variant="primary" onClick={() => setReplace(true)}>
              {mode === 'checker' ? 'Make the replacement' : 'Open in the generator'}
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

function Note({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'good'
  children: ReactNode
}) {
  const Icon = tone === 'warn' ? TriangleAlert : tone === 'good' ? CircleCheck : Info
  return (
    <p
      className={`mt-4 flex gap-2 rounded-lg px-4 py-3 text-ink ${tone === 'warn' ? 'border-[1.5px] border-scan-fail bg-surface' : 'bg-mint'}`}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function Notes({
  mode,
  parsed,
  link,
  host,
  service,
  ours,
  shortener,
}: {
  mode: Mode
  parsed: ParsedContent
  link: string | null
  host: string
  service: ReturnType<typeof identifyQrService>
  ours: boolean
  shortener: boolean
}) {
  if (ours) {
    return (
      <Note tone="good">
        This is a QRfinity code. QRfinity codes never expire. If it doesn’t open, its owner paused
        it, or we turned it off because it broke our{' '}
        <Link href="/acceptable-use" className="text-evergreen underline">
          rules
        </Link>
        .
      </Note>
    )
  }
  if (service) {
    return (
      <Note tone="warn">
        This code runs through {service.name}’s short link ({host}). The code only works while that
        link does: codes made there can stop when a trial or plan ends. Check the link to see if it
        still works.
      </Note>
    )
  }
  if (shortener) {
    return (
      <Note tone="warn">
        This is a short link from {host}. The real address is hidden until it’s opened, so check the
        link before you open it.
      </Note>
    )
  }
  if (link) {
    return mode === 'checker' ? (
      <Note>
        This code links straight to {host}, with no service in between, so the code itself can’t
        expire. If it stopped working, the page has moved or gone: check the link to see.
      </Note>
    ) : link.startsWith('http://') ? (
      <Note tone="warn">
        This link isn’t encrypted (it starts with http://). Don’t enter passwords or payment details
        on the page it opens.
      </Note>
    ) : null
  }
  return mode === 'checker' ? (
    <Note>
      This code holds the {parsed.type === 'text' ? 'text' : TYPE_LABEL[parsed.type]} itself, not a
      link, so it can’t expire or be switched off. If phones won’t read it, the print is the
      problem: it may be damaged, too small or low on contrast.{' '}
      <Link href="/qr-code-stopped-working" className="text-evergreen underline">
        What to check
      </Link>
    </Note>
  ) : null
}

const STATUS_TEXT: Record<number, string> = {
  404: 'page not found',
  410: 'page removed',
  500: 'server error',
  502: 'bad gateway',
  504: 'gateway timeout',
}

function CheckOutcome({ result: r }: { result: LinkCheck }) {
  switch (r.outcome) {
    case 'works':
      return (
        <Note tone="good">
          The link works. It opens <span className="break-all">{r.finalUrl}</span>
          {r.hops.length > 1
            ? ` after ${r.hops.length - 1} redirect${r.hops.length > 2 ? 's' : ''}`
            : ''}
          .
        </Note>
      )
    case 'deactivated':
      return (
        <Note tone="warn">
          The link loads, but the page says the code was switched off (“{r.evidence}”). That’s what
          happens when a trial or plan ends. Make a replacement below.
        </Note>
      )
    case 'broken':
      return (
        <Note tone="warn">
          The link is broken: the site answered {r.status}
          {STATUS_TEXT[r.status] ? ` (${STATUS_TEXT[r.status]})` : ''} at{' '}
          <span className="break-all">{r.finalUrl}</span>.
        </Note>
      )
    case 'uncertain':
      return (
        <Note>
          We couldn’t tell: the site refused our automated check (status {r.status}). Try opening
          the link on your phone.
        </Note>
      )
    case 'unreachable':
      return (
        <Note tone="warn">
          {r.reason === 'dns'
            ? `We couldn’t find the website ${hostOf(r.finalUrl)}. Its address may no longer exist. Try opening the link on your phone to be sure.`
            : r.reason === 'timeout'
              ? 'The site didn’t answer in time. It may be down.'
              : r.reason === 'too-many-redirects'
                ? 'The link goes round in circles: too many redirects.'
                : 'We couldn’t connect to the site.'}
        </Note>
      )
    case 'not-checked':
      return (
        <Note>
          {r.reason === 'private-address'
            ? 'This link points to a private network address, so we didn’t check it.'
            : r.reason === 'unusual-port'
              ? 'This link uses an unusual port, so we didn’t check it.'
              : 'This isn’t a web link we can check.'}
        </Note>
      )
  }
}
