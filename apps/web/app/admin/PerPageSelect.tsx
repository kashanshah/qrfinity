'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useId } from 'react'

const STORAGE_KEY = 'qrfinity.admin.perPage'

function readStored(): number | null {
  try {
    const n = Number(window.localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/**
 * Rows per page. The choice is remembered in this browser and applied whenever the address
 * doesn't name a page size. Changing it goes back to the first page.
 */
export function PerPageSelect({ value, options }: { value: number; options: readonly number[] }) {
  const id = useId()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const go = (per: number, replace = false) => {
    const sp = new URLSearchParams(searchParams.toString())
    sp.set('per', String(per))
    sp.delete('page')
    const url = `${pathname}?${sp.toString()}`
    if (replace) router.replace(url)
    else router.push(url)
  }

  useEffect(() => {
    if (searchParams.has('per')) return
    const stored = readStored()
    if (stored && stored !== value && options.includes(stored)) go(stored, true)
    // Only on arrival: later changes go through the select.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <span className="inline-flex items-center gap-2">
      <label htmlFor={id} className="body-small text-ink-muted">
        Per page
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const per = Number(e.target.value)
          try {
            window.localStorage.setItem(STORAGE_KEY, String(per))
          } catch {
            // Storage blocked: the choice still applies to this visit through the address.
          }
          go(per)
        }}
        className="min-h-10 rounded-md border-[1.5px] border-control-border bg-surface px-2 text-ink"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </span>
  )
}
