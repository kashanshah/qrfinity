/**
 * Colour theme: "auto" follows the device; "light" or "dark" is the visitor's choice, kept in
 * this browser's localStorage and applied as <html data-theme> (brand/tokens.css reads it).
 */

export const THEMES = ['auto', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_KEY = 'qrfinity-theme'
const THEME_EVENT = 'qrfinity:theme'

/** --ground in brand/tokens.css. Browser-bar colours (meta theme-color) can't read CSS variables. */
export const GROUND = { light: '#fafaf7', dark: '#0e1411' } as const

/**
 * Runs in <head> before the page paints, so a saved choice never flashes the other theme.
 * Kept tiny and self-contained: it can't import anything.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'light' || t === 'dark' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

/** Points the browser-bar colour at the chosen theme, or back at the device setting for auto. */
function applyBrowserBar(theme: Theme) {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const media = meta.getAttribute('media') ?? ''
    const own = media.includes('dark') ? GROUND.dark : GROUND.light
    meta.content = theme === 'auto' ? own : GROUND[theme]
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  applyBrowserBar(theme)
}

export function setTheme(theme: Theme) {
  try {
    if (theme === 'auto') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Storage blocked (private mode, settings): the choice still applies to this page.
  }
  applyTheme(theme)
  window.dispatchEvent(new Event(THEME_EVENT))
}

/** For useSyncExternalStore: this tab's changes and other tabs' (via the storage event). */
export function subscribeTheme(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return
    applyTheme(readTheme())
    onChange()
  }
  window.addEventListener(THEME_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(THEME_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}
