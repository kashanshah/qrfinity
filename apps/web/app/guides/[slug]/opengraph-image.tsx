import { GUIDES, getPage } from '@/content/registry'
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'QRfinity'

export function generateStaticParams() {
  return GUIDES.map((p) => ({ slug: p.path.split('/').pop()! }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  return ogImage(getPage(`/guides/${(await params).slug}`))
}
