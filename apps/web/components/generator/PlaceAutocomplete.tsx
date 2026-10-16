'use client'

import { MapPin } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { control, FieldShell, TextField } from '@/components/ui/Field'
import { MAPS_KEY, PlacesSession, type PlaceSuggestion } from '@/lib/places'

const MIN_CHARS = 3
const DEBOUNCE_MS = 250

/**
 * An address field with Google Maps suggestions. Picking one keeps its place ID so the QR code
 * opens that exact place; typing again clears it. Without an API key it's a plain text field.
 */
export function PlaceAutocomplete({
  label,
  value,
  placeId,
  onChange,
  onBlur,
  error,
  hint,
}: {
  label: string
  value: string
  placeId: string
  onChange: (address: string, placeId: string) => void
  onBlur?: () => void
  error?: string
  hint?: ReactNode
}) {
  if (!MAPS_KEY) {
    return (
      <TextField
        label={label}
        autoComplete="street-address"
        value={value}
        onChange={(e) => onChange(e.target.value, '')}
        onBlur={onBlur}
        error={error}
        hint={hint}
      />
    )
  }
  return <WithSuggestions {...{ label, value, placeId, onChange, onBlur, error, hint }} />
}

function WithSuggestions({
  label,
  value,
  placeId,
  onChange,
  onBlur,
  error,
  hint,
}: Parameters<typeof PlaceAutocomplete>[0]) {
  const id = useId()
  const listId = `${id}-list`
  const session = useRef<PlacesSession | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  const [items, setItems] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [unavailable, setUnavailable] = useState(false)

  // Fetch suggestions for what the person typed (at least MIN_CHARS; not text set by a pick).
  useEffect(() => {
    if (query === null || unavailable) return
    const input = query.trim()
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        session.current ??= new PlacesSession()
        const found = await session.current.suggest(input)
        if (cancelled) return
        setItems(found)
        setActive(-1)
        setOpen(found.length > 0)
      } catch (e) {
        if (cancelled) return
        // Bad key, quota or network: carry on as a plain text field.
        console.warn('Address suggestions are unavailable.', e)
        setUnavailable(true)
        setOpen(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, unavailable])

  const pick = (s: PlaceSuggestion) => {
    onChange(s.text, s.placeId)
    setQuery(null)
    setItems([])
    setOpen(false)
    void session.current?.pick(s.placeId)
  }

  const describedBy = error || hint ? `${id}-msg` : undefined
  const fieldHint = (
    <>
      {hint}
      {hint ? ' ' : ''}
      {placeId ? 'Pinned to the place you picked.' : 'Suggestions come from Google Maps.'}
    </>
  )

  return (
    <FieldShell id={id} label={label} hint={fieldHint} error={error}>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          className={control}
          value={value}
          onChange={(e) => {
            const text = e.target.value
            onChange(text, '')
            if (text.trim().length >= MIN_CHARS) {
              setQuery(text)
            } else {
              // Too short to search: drop any earlier suggestions.
              setQuery(null)
              setItems([])
              setOpen(false)
            }
          }}
          onKeyDown={(e) => {
            if (!open || items.length === 0) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => (i + 1) % items.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => (i <= 0 ? items.length - 1 : i - 1))
            } else if (e.key === 'Enter' && active >= 0) {
              e.preventDefault()
              pick(items[active]!)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          onBlur={() => {
            // Let a click on a suggestion land before the list closes.
            setTimeout(() => setOpen(false), 150)
            onBlur?.()
          }}
          onFocus={() => setOpen(items.length > 0)}
        />
        {open ? (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-hairline bg-surface shadow-card">
            <ul id={listId} role="listbox" aria-label={`${label} suggestions`}>
              {items.map((s, i) => (
                <li
                  key={s.placeId}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`flex cursor-pointer gap-2 px-3 py-2 text-ink ${i === active ? 'bg-mint' : 'hover:bg-surface-sunk'}`}
                  // mousedown, not click, so the input's blur doesn't close the list first.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(s)
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  <MapPin
                    aria-hidden="true"
                    size={18}
                    strokeWidth={1.75}
                    className="mt-0.5 shrink-0 text-ink-muted"
                  />
                  <span className="min-w-0">
                    <span className="block font-bold">{s.main}</span>
                    {s.secondary ? (
                      <span className="body-small block text-ink-muted">{s.secondary}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {/*
              Google's terms require its logo next to Places data shown without a map. The file is
              Google's own, unaltered, at its native size (see public/third-party/README.md). The
              label sits beside the logo, never in a sentence around it, as Google's rules ask.
            */}
            <div className="flex items-center justify-end gap-1.5 border-t border-hairline px-3 py-2">
              <span className="body-small text-ink-muted">Powered by</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- static third-party logo */}
              <img src="/third-party/google-logo.svg" alt="Google" width={56} height={20} />
            </div>
          </div>
        ) : null}
      </div>
    </FieldShell>
  )
}
