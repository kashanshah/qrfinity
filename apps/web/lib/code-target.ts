import { isPageType, pageSummary, cleanVcardFields } from '@qrfinity/core'

/** What a dynamic code opens, in one line: its destination, or its hosted page. */
export function codeTarget(c: {
  destination: string | null
  content?: { type: string; fields: unknown } | null
}): string {
  if (c.destination) return c.destination
  if (c.content && isPageType(c.content.type))
    return pageSummary({ type: 'vcard', fields: cleanVcardFields(c.content.fields) })
  return ''
}
