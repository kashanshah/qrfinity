import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../src/color'
import { DEFAULT_FIELDS } from '../src/content'
import {
  BRAND_ACCENT,
  PAGE_TEMPLATES,
  cleanPageStyle,
  readableAccent,
  renderContactPage,
  resolveAccent,
} from '../src/links/page-html'

const fields = {
  ...DEFAULT_FIELDS.vcard,
  firstName: 'Jane',
  lastName: 'Doe <script>',
  mobile: '+1 416 555 0100',
}
const render = (template: (typeof PAGE_TEMPLATES)[number], accent = '#0f5132') =>
  renderContactPage({
    fields,
    style: { template, accent },
    accent,
    slug: 'aB3xK9q',
    siteOrigin: 'https://qrfinity.com',
  })

describe('contact page templates', () => {
  it('renders every template with escaped details and the save link', () => {
    for (const t of PAGE_TEMPLATES) {
      const html = render(t)
      expect(html).toContain(`<body class="t-${t}">`)
      expect(html).toContain('Jane Doe &lt;script&gt;')
      expect(html).not.toContain('<script>')
      expect(html).toContain('href="/aB3xK9q.vcf"')
      expect(html).toContain('href="tel:+14165550100"')
    }
    expect(render('banner')).toContain('<div class="band"></div>')
    expect(render('classic')).not.toContain('class="band"')
  })

  it('keeps only known templates and real colours', () => {
    expect(cleanPageStyle({ template: 'neon', accent: 'red' })).toEqual({
      template: 'classic',
      accent: null,
    })
    expect(cleanPageStyle({ template: 'banner', accent: '#ABC' })).toEqual({
      template: 'banner',
      accent: '#aabbcc',
    })
    expect(cleanPageStyle(undefined)).toEqual({ template: 'classic', accent: null })
  })

  it('matches the printed code’s colour, unless it’s black or grey', () => {
    expect(resolveAccent('#c2410c', '#1d4ed8')).toBe('#c2410c')
    expect(resolveAccent(null, '#1d4ed8')).toBe('#1d4ed8')
    expect(resolveAccent(null, '#000000')).toBe(BRAND_ACCENT)
    expect(resolveAccent(null, '#777777')).toBe(BRAND_ACCENT)
    expect(resolveAccent(null, null)).toBe(BRAND_ACCENT)
  })

  it('adjusts the accent so its text stays readable in light and dark mode', () => {
    for (const accent of ['#ffeb3b', '#0f5132', '#000000', '#ff00ff']) {
      expect(contrastRatio(readableAccent(accent, '#ffffff'), '#ffffff')).toBeGreaterThanOrEqual(
        4.5,
      )
      expect(contrastRatio(readableAccent(accent, '#151d19'), '#151d19')).toBeGreaterThanOrEqual(
        4.5,
      )
    }
    // A colour that already works is left alone.
    expect(readableAccent('#0f5132', '#ffffff')).toBe('#0f5132')
  })
})
