'use client'

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { applyTheme, readTheme, setTheme, subscribeTheme, type Theme } from '@/lib/theme'

const OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'auto', label: 'Auto (match device)', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

/** The colour theme: auto by default; a choice is remembered in this browser (lib/theme.ts). */
const useTheme = () => useSyncExternalStore(subscribeTheme, readTheme, () => 'auto' as const)

/** The three choices, for the header dropdown and the phone menu. */
export function ThemeOptions({ onPick }: { onPick?: () => void }) {
  const theme = useTheme()
  return (
    <div role="group" aria-label="Theme" className="flex flex-col">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={theme === o.value}
          onClick={() => {
            setTheme(o.value)
            onPick?.()
          }}
          className={`flex min-h-11 items-center gap-3 whitespace-nowrap rounded-md px-3 text-left ${theme === o.value ? 'bg-mint font-bold text-ink' : 'text-ink hover:bg-surface-sunk'}`}
        >
          <o.icon aria-hidden="true" size={18} strokeWidth={1.75} className="shrink-0" />
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Header dropdown (wider screens; phones get ThemeOptions in the menu). */
export function ThemeSwitch() {
  const theme = useTheme()
  const menu = useRef<HTMLDetailsElement>(null)
  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[0]!
  const Icon = current.icon

  // The <head> script already set data-theme; this also points the browser bar at the choice.
  useEffect(() => applyTheme(theme), [theme])

  // Close when clicking elsewhere or pressing Escape.
  useEffect(() => {
    const close = (e: Event) => {
      const el = menu.current
      if (!el?.open) return
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !el.contains(e.target as Node)) {
        el.open = false
        if (e instanceof KeyboardEvent) el.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', close)
    }
  }, [])

  return (
    <details ref={menu} className="relative hidden md:block">
      <summary
        aria-label={`Theme: ${current.label}`}
        title="Theme"
        className="flex size-11 list-none items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunk hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
      </summary>
      <div className="absolute right-0 top-12 z-40 w-64 rounded-lg border border-hairline bg-surface p-2 shadow-card">
        <ThemeOptions
          onPick={() => {
            if (menu.current) menu.current.open = false
          }}
        />
      </div>
    </details>
  )
}
