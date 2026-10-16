'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard blocked: nothing to do, the link is visible next to the button.
        }
      }}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunk hover:text-ink"
    >
      {copied ? (
        <Check aria-hidden="true" size={16} strokeWidth={2} />
      ) : (
        <Copy aria-hidden="true" size={16} strokeWidth={1.75} />
      )}
    </button>
  )
}
