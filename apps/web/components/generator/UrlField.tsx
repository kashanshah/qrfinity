'use client'

import { DEFAULT_FIELDS } from '@qrfinity/core'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { TextField } from '../ui/Field'

/** Links people typically put in a QR code, typed one after another as a hint. */
const EXAMPLES = [
  'yourcafe.com/menu',
  'instagram.com/yourshop',
  'yourshop.com/summer-sale',
  'youtube.com/@yourchannel',
]

const TYPE_MS = 70
const ERASE_MS = 35
const HOLD_MS = 1400

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
function subscribeMotion(onChange: () => void) {
  const m = window.matchMedia('(prefers-reduced-motion: reduce)')
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}

/** Types and erases the examples in turn, forever, while mounted. */
function Typewriter() {
  const [text, setText] = useState('')
  useEffect(() => {
    let i = 0
    let len = 0
    let erasing = false
    let timer: ReturnType<typeof setTimeout>
    const step = () => {
      const word = EXAMPLES[i % EXAMPLES.length]!
      if (!erasing && len < word.length) {
        len++
        timer = setTimeout(step, TYPE_MS)
      } else if (!erasing) {
        erasing = true
        timer = setTimeout(step, HOLD_MS)
      } else if (len > 0) {
        len--
        timer = setTimeout(step, ERASE_MS)
      } else {
        erasing = false
        i++
        timer = setTimeout(step, TYPE_MS * 4)
      }
      setText(word.slice(0, len))
    }
    timer = setTimeout(step, 600)
    return () => clearTimeout(timer)
  }, [])
  return (
    <>
      {text}
      <span className="typing-caret" />
    </>
  )
}

/**
 * The website address field. Until someone touches it, it still holds the example address, and
 * an animated hint types sample links over it with a soft highlight, so it's obvious where to
 * start. Clicking in selects the example, so typing replaces it.
 */
export function UrlField(props: {
  value: string
  onChange: (e: { target: { value: string } }) => void
  onBlur: () => void
  error?: string
  hint: ReactNode
}) {
  const [engaged, setEngaged] = useState(false)
  const still = useSyncExternalStore(subscribeMotion, reducedMotion, () => false)
  const isExample = props.value === DEFAULT_FIELDS.url.url
  const hinting = isExample && !engaged

  return (
    <TextField
      label="Website address"
      type="url"
      inputMode="url"
      autoComplete="url"
      placeholder="example.com/menu"
      value={props.value}
      onChange={props.onChange}
      onBlur={props.onBlur}
      error={props.error}
      hint={props.hint}
      onFocus={(e) => {
        setEngaged(true)
        // The example is there to show what goes here: typing replaces it.
        if (isExample) e.currentTarget.select()
      }}
      inputClassName={hinting ? 'url-hint-ring' : ''}
      overlay={
        hinting && !still ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[1.5px] flex items-center overflow-hidden whitespace-nowrap rounded-md bg-surface px-3 text-ink-muted"
          >
            <Typewriter />
          </span>
        ) : null
      }
    />
  )
}
