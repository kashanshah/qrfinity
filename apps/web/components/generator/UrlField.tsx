'use client'

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
function Typewriter({ caret }: { caret: boolean }) {
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
      {/* In the field, the browser's own caret blinks: no second one. */}
      {caret ? <span className="typing-caret" /> : null}
    </>
  )
}

/**
 * The website address field. It starts empty; while it's empty, an animated hint types sample
 * links into it (also while it has focus), so it's obvious what goes here. The first letter
 * typed hides the hint; clearing the field brings it back. People who prefer less motion get a
 * plain placeholder instead.
 */
export function UrlField(props: {
  value: string
  onChange: (e: { target: { value: string } }) => void
  onBlur: () => void
  error?: string
  hint: ReactNode
}) {
  const [focused, setFocused] = useState(false)
  const still = useSyncExternalStore(subscribeMotion, reducedMotion, () => false)
  const empty = props.value === ''
  const animate = empty && !still

  return (
    <TextField
      label="Website address"
      type="url"
      inputMode="url"
      autoComplete="url"
      placeholder={animate ? undefined : EXAMPLES[0]}
      value={props.value}
      onChange={props.onChange}
      onBlur={() => {
        setFocused(false)
        props.onBlur()
      }}
      error={props.error}
      hint={props.hint}
      onFocus={() => setFocused(true)}
      // A soft highlight draws the eye to the empty field; the focus ring takes over once in it.
      inputClassName={empty && !focused ? 'url-hint-ring' : ''}
      overlay={
        animate ? (
          <span
            aria-hidden="true"
            data-url-hint=""
            className="pointer-events-none absolute inset-[1.5px] flex items-center overflow-hidden whitespace-nowrap rounded-md px-3 text-ink-muted"
          >
            <Typewriter caret={!focused} />
          </span>
        ) : null
      }
    />
  )
}
