import { describe, expect, it } from 'vitest'
import { DEFAULT_FIELDS } from '../src/content'
import {
  cleanVcardFields,
  pageSummary,
  pageWebsite,
  parsePage,
  vcardFile,
  vcardFileName,
} from '../src/links/page'
import { parseLinkRecord } from '../src/links/record'

const jane = {
  ...DEFAULT_FIELDS.vcard,
  firstName: 'Jane',
  lastName: 'Doe',
  organization: 'Acme, Inc.',
  website: 'acme.example',
}

describe('hosted contact pages', () => {
  it('keeps only known string fields, trimmed in length', () => {
    const f = cleanVcardFields({ firstName: 'J'.repeat(500), evil: '<script>', note: 7 })
    expect(f.firstName).toHaveLength(300)
    expect(f).not.toHaveProperty('evil')
    expect(f.note).toBe('')
  })

  it('parses only usable contact cards', () => {
    expect(parsePage({ type: 'vcard', fields: jane })).toEqual({ type: 'vcard', fields: jane })
    expect(parsePage({ type: 'vcard', fields: {} })).toBeUndefined() // no name
    expect(parsePage({ type: 'url', fields: { url: 'x' } })).toBeUndefined()
    expect(parsePage(null)).toBeUndefined()
  })

  it('builds a .vcf with CRLF line endings and escaped values', () => {
    const file = vcardFile(jane)!
    expect(file.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true)
    expect(file).toContain('ORG:Acme\\, Inc.\r\n')
    expect(file.endsWith('END:VCARD\r\n')).toBe(true)
    expect(vcardFileName(jane)).toBe('jane-doe.vcf')
    expect(vcardFileName({ ...DEFAULT_FIELDS.vcard, organization: 'Café Ünï' })).toBe(
      'cafe-uni.vcf',
    )
  })

  it('describes the page and finds its website for screening', () => {
    const page = { type: 'vcard' as const, fields: jane }
    expect(pageSummary(page)).toBe('Contact card: Jane Doe')
    expect(pageWebsite(page)).toBe('https://acme.example')
    expect(pageWebsite({ type: 'vcard', fields: { ...jane, website: '' } })).toBeNull()
  })

  it('reads a page record with no destination, and ignores rules on it', () => {
    const r = parseLinkRecord({
      id: 'c',
      owner: 'o',
      dest: '',
      status: 'active',
      v: 1,
      page: { type: 'vcard', fields: jane },
      rules: [{ name: '', when: { type: 'device', devices: ['ios'] }, dest: 'https://x.example' }],
    })
    expect(r?.page?.fields.firstName).toBe('Jane')
    expect(r).not.toHaveProperty('rules')
    expect(parseLinkRecord({ id: 'c', owner: 'o', dest: '', status: 'active', v: 1 })).toBeNull()
  })
})
