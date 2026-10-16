import { describe, expect, it } from 'vitest'
import { SECURITY_TXT_EXPIRES } from '@/app/.well-known/security.txt/route'
import { llmsIndex, mdxToMarkdown } from '@/lib/llms'
import { ALL_PAGES } from '@/content/registry'
import { absoluteUrl } from '@/lib/seo'

describe('files for search engines and AI assistants', () => {
  it('turns MDX into readable Markdown, keeping sources and dropping components', () => {
    const md = mdxToMarkdown(
      [
        'export const faq = [',
        "  { q: 'A?', a: 'B.' },",
        ']',
        '',
        '## Heading',
        '',
        'Trials end. {/* source: https://example.com/help, seen 2026-10-16 */}',
        '',
        '<Screenshot name="wifi" alt="x" />',
        '<Recommendation pick="static">',
        'Use static.',
        '</Recommendation>',
      ].join('\n'),
    )
    expect(md).toContain('## Heading')
    expect(md).toContain('Trials end. (source: https://example.com/help, checked 2026-10-16)')
    expect(md).toContain('**Recommendation: static.**')
    expect(md).not.toMatch(/faq|Screenshot|<|\{\/\*/)
  })

  it('lists every public content page in llms.txt', () => {
    const txt = llmsIndex()
    for (const p of ALL_PAGES.filter((p) => p.kind !== 'home' && p.kind !== 'hub'))
      expect(txt, p.path).toContain(absoluteUrl(p.path))
  })

  it('keeps security.txt from expiring unnoticed', () => {
    const daysLeft = (Date.parse(SECURITY_TXT_EXPIRES) - Date.now()) / 86_400_000
    expect(daysLeft, 'Renew Expires in app/.well-known/security.txt/route.ts').toBeGreaterThan(30)
  })
})
