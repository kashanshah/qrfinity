'use client'

import { ChevronDown, Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { NAV, type NavItem } from './nav-links'
import { ThemeOptions } from './ThemeSwitch'

const isIn = (path: string, item: NavItem) =>
  path === item.href ||
  !!item.children?.some((c) => path === c.href || path.startsWith(`${c.href}/`))

/**
 * Wider screens: groups open on hover and on keyboard focus. Choosing a link closes its group
 * (the page changes without a reload, so otherwise focus and the pointer would keep it open);
 * it opens again once the pointer leaves and comes back.
 */
export function DesktopNav() {
  const [closed, setClosed] = useState<string | null>(null)
  const close = (label: string) => {
    setClosed(label)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {NAV.map((l) => (
          <li
            key={l.label}
            className="group relative"
            data-closed={closed === l.label ? '' : undefined}
            onMouseLeave={() => setClosed((c) => (c === l.label ? null : c))}
          >
            <Link
              href={l.href}
              onClick={() => close(l.label)}
              className="label flex items-center gap-1 rounded-md px-3 py-2 text-ink-muted hover:bg-surface-sunk hover:text-ink"
            >
              {l.label}
              {l.children ? (
                <ChevronDown
                  aria-hidden="true"
                  size={14}
                  strokeWidth={2}
                  className="transition-transform group-focus-within:rotate-180 group-hover:rotate-180 group-data-[closed]:rotate-0!"
                />
              ) : null}
            </Link>
            {l.children ? (
              // pt-2 keeps the pointer inside the group while it moves down to the panel.
              <div className="invisible absolute left-0 top-full z-40 pt-2 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 group-data-[closed]:invisible! group-data-[closed]:opacity-0!">
                <ul className="w-60 rounded-lg border border-hairline bg-surface p-2 shadow-card">
                  {l.children.map((c) => (
                    <li key={c.href + c.label}>
                      <Link
                        href={c.href}
                        onClick={() => close(l.label)}
                        className="flex min-h-10 items-center rounded-md px-3 text-ink hover:bg-surface-sunk"
                      >
                        {c.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Phones: a drawer from the right, built on <dialog> so focus stays inside it, Escape closes it
 * and the page behind can't be reached. A tap on a link or on the dimmed page closes it.
 */
export function MobileNav() {
  const dialog = useRef<HTMLDialogElement>(null)
  const path = usePathname()
  const close = () => dialog.current?.close()

  // A new page (including the back button) closes the drawer.
  useEffect(() => {
    dialog.current?.close()
  }, [path])

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className="flex size-11 items-center justify-center rounded-md text-ink hover:bg-surface-sunk"
      >
        <Menu aria-hidden="true" size={22} strokeWidth={1.75} />
      </button>
      <dialog
        ref={dialog}
        aria-label="Menu"
        // A click on the backdrop lands on the dialog itself, outside its panel.
        onClick={(e) => {
          if (e.target === e.currentTarget) close()
        }}
        className="drawer fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-[min(22rem,88vw)] max-w-none border-l border-hairline bg-surface p-0 text-ink shadow-card"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-hairline px-4">
            <span className="subheading">Menu</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={close}
              className="flex size-11 items-center justify-center rounded-md hover:bg-surface-sunk"
            >
              <X aria-hidden="true" size={22} strokeWidth={1.75} />
            </button>
          </div>
          <nav aria-label="Main" className="flex-1 overflow-y-auto overscroll-contain p-2">
            <ul className="flex flex-col">
              {NAV.map((l) =>
                l.children ? (
                  <li key={l.label}>
                    <details className="group/sec" open={isIn(path, l)}>
                      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between rounded-md px-3 font-bold hover:bg-surface-sunk [&::-webkit-details-marker]:hidden">
                        {l.label}
                        <ChevronDown
                          aria-hidden="true"
                          size={18}
                          strokeWidth={1.75}
                          className="transition-transform group-open/sec:rotate-180"
                        />
                      </summary>
                      <ul className="mb-2 ml-3 border-l border-hairline pl-2">
                        {l.children.map((c) => (
                          <li key={c.href + c.label}>
                            <Link
                              href={c.href}
                              onClick={close}
                              aria-current={path === c.href ? 'page' : undefined}
                              className="flex min-h-11 items-center rounded-md px-3 hover:bg-surface-sunk aria-[current=page]:bg-mint aria-[current=page]:font-bold"
                            >
                              {c.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ) : (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      onClick={close}
                      aria-current={path === l.href ? 'page' : undefined}
                      className="flex min-h-12 items-center rounded-md px-3 font-bold hover:bg-surface-sunk aria-[current=page]:bg-mint"
                    >
                      {l.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
          <div className="shrink-0 border-t border-hairline p-2">
            <p className="label px-3 pb-1 pt-1 text-ink-muted">Theme</p>
            <ThemeOptions onPick={close} />
          </div>
        </div>
      </dialog>
    </div>
  )
}
