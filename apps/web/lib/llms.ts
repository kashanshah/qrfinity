import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ABOUT,
  ALTERNATIVES,
  FACT_BLOCK,
  GUIDES,
  LANDINGS,
  FEATURE_PAGES,
  INDUSTRY_PAGES,
  TOOLS,
  LEGAL,
  PRICING,
  SITE_URL,
  USE_CASES,
  type ContentPage,
} from '@/content/registry'
import { loadContent, type ContentDir } from '@/content/load'
import { absoluteUrl } from './seo'

const SECTIONS: { heading: string; pages: ContentPage[]; dir?: ContentDir }[] = [
  { heading: 'Free QR codes', pages: LANDINGS, dir: 'landings' },
  { heading: 'Advanced features', pages: FEATURE_PAGES, dir: 'landings' },
  { heading: 'QR codes by industry', pages: INDUSTRY_PAGES, dir: 'landings' },
  { heading: 'Free tools', pages: TOOLS, dir: 'tools' },
  { heading: 'QR code generators by use', pages: USE_CASES, dir: 'use-cases' },
  { heading: 'Guides', pages: GUIDES, dir: 'guides' },
  { heading: 'Comparisons', pages: ALTERNATIVES, dir: 'alternatives' },
  { heading: 'Company and policies', pages: [PRICING, ABOUT, ...LEGAL] },
]

const FACTS = [
  'Static QR codes: free, unlimited, made in the browser, no sign-up, never expire.',
  'Dynamic QR codes: free and unlimited with a free account; editable destination, or a contact card page with a Save contact button whose details can be updated after printing; scan analytics (total and unique scans, devices, countries, up to 2 years of history); never expire and are never paused for not paying.',
  'Downloads: PNG and JPG free; SVG, PDF and EPS with a paid plan. No watermark.',
  'Short links for dynamic codes use qrfinity.link. No IP addresses are stored; no cookies on short links.',
  'In the terms of service: codes never expire and are never paused for not paying; no watermark.',
  'Paid plans add SVG, PDF and EPS downloads and more contact card templates (2 free, 4 on Plus, 6 on Pro, all 8 on Unlimited). Advanced features (custom short links, redirect rules by phone, country or time, password protection, split traffic for A/B tests, and date or scan limits that switch a code to another page) work on 1 code free; paid plans cover 10 codes for $5/month, 100 for $20, or every code for $50, with the first month free. When a plan ends every code keeps working, including custom short links; redirect rules, splits and limits beyond the free code pause and scans go to the main destination; passwords stay on.',
  'Made by Teknoffice Technologies Inc., Ontario, Canada. Contact: hello@qrfinity.com.',
]

/** /llms.txt: a short, link-rich map of the site for AI assistants (llmstxt.org format). */
export function llmsIndex(): string {
  const lines = [
    '# QRfinity',
    '',
    `> ${FACT_BLOCK}`,
    '',
    ...FACTS.map((f) => `- ${f}`),
    '',
    `Generator: ${SITE_URL}/ · Full text of every page: ${SITE_URL}/llms-full.txt`,
  ]
  for (const s of SECTIONS) {
    lines.push('', `## ${s.heading}`, '')
    for (const p of s.pages) lines.push(`- [${p.h1}](${absoluteUrl(p.path)}): ${p.description}`)
  }
  return lines.join('\n') + '\n'
}

/** MDX source → readable Markdown: keeps headings, lists, tables and source links; drops components. */
export function mdxToMarkdown(src: string): string {
  return src
    .replace(/^export const faq = \[[\s\S]*?^\]\n/m, '')
    .replace(/^import .*\n/gm, '')
    .replace(
      /\s*\{\/\*\s*source:\s*(\S+?),?\s+seen\s+([\d-]+)\s*\*\/\}/g,
      ' (source: $1, checked $2)',
    )
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<Screenshot[^>]*\/>\n?/g, '')
    .replace(
      /<Recommendation pick="(\w+)">/g,
      (_m, pick: string) => `**Recommendation: ${pick}.** `,
    )
    .replace(/<Callout[^>]*>/g, '**Note:** ')
    .replace(/<\/(Recommendation|Callout)>/g, '')
    .replace(/<FactBlock\s*\/>/g, FACT_BLOCK)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** /llms-full.txt: every content page as plain Markdown, with its FAQ. */
export async function llmsFull(): Promise<string> {
  const parts = [
    `# QRfinity: full content`,
    '',
    `> ${FACT_BLOCK}`,
    '',
    ...FACTS.map((f) => `- ${f}`),
  ]
  for (const s of SECTIONS) {
    if (!s.dir) continue
    for (const p of s.pages) {
      const slug = p.path.split('/').pop()!
      const [raw, mod] = await Promise.all([
        readFile(path.join(process.cwd(), 'content', s.dir, `${slug}.mdx`), 'utf8'),
        loadContent(s.dir, slug),
      ])
      parts.push(
        '',
        '---',
        '',
        `# ${p.h1}`,
        '',
        `URL: ${absoluteUrl(p.path)}`,
        `Last updated: ${p.updated}`,
        '',
        p.intro,
        '',
        mdxToMarkdown(raw),
      )
      if (mod.faq?.length) {
        parts.push('', '## Questions people ask', '')
        for (const f of mod.faq) parts.push(`**${f.q}**`, '', f.a, '')
      }
    }
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n') + '\n'
}
