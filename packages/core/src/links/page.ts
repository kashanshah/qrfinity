/**
 * Hosted pages: dynamic codes whose content can't be a redirect (a contact card) are served as a
 * small page on the short domain instead. The redirect Worker renders it from the edge record;
 * the web app stores the fields in `codes.content` and has no destination for these codes.
 */
import {
  DEFAULT_FIELDS,
  encodeContent,
  normalizeWebUrl,
  type ContentType,
  type VcardFields,
} from '../content'

export const PAGE_TYPES = ['vcard'] as const satisfies readonly ContentType[]
export type PageType = (typeof PAGE_TYPES)[number]

export type HostedPage = { type: 'vcard'; fields: VcardFields }

const FIELD_MAX = 300
const NOTE_MAX = 1000

export function isPageType(type: unknown): type is PageType {
  return (PAGE_TYPES as readonly unknown[]).includes(type)
}

/** Keeps only known string fields, trimmed to sensible lengths. */
export function cleanVcardFields(input: unknown): VcardFields {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const out = { ...DEFAULT_FIELDS.vcard }
  for (const key of Object.keys(out) as (keyof VcardFields)[]) {
    const v = src[key]
    if (typeof v === 'string') out[key] = v.slice(0, key === 'note' ? NOTE_MAX : FIELD_MAX)
  }
  return out
}

/** Lenient parse for the Worker: anything that isn't a usable contact card is ignored. */
export function parsePage(value: unknown): HostedPage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as { type?: unknown; fields?: unknown }
  if (v.type !== 'vcard') return undefined
  const fields = cleanVcardFields(v.fields)
  return encodeContent('vcard', fields).ok ? { type: 'vcard', fields } : undefined
}

/** The .vcf file served for "Save contact" (vCard 3.0, CRLF line endings as the spec asks). */
export function vcardFile(fields: VcardFields): string | null {
  const r = encodeContent('vcard', fields)
  return r.ok ? r.payload.replace(/\n/g, '\r\n') + '\r\n' : null
}

/** The name shown for a contact card: the person's name, else the organisation. */
export function contactName(fields: VcardFields): string {
  const full = [fields.firstName.trim(), fields.lastName.trim()].filter(Boolean).join(' ')
  return full || fields.organization.trim()
}

/** A safe download name, e.g. "jane-doe.vcf". */
export function vcardFileName(fields: VcardFields): string {
  const base = contactName(fields)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .slice(0, 60)
  return `${base || 'contact'}.vcf`
}

/** The page's web address, if any: screened and re-checked like a destination. */
export function pageWebsite(page: HostedPage): string | null {
  return page.fields.website.trim() ? normalizeWebUrl(page.fields.website) : null
}

/** One line describing the page, for lists and destination history. */
export function pageSummary(page: HostedPage): string {
  return `Contact card: ${contactName(page.fields) || 'unnamed'}`
}
