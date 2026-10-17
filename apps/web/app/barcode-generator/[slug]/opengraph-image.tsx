import { BARCODE_PAGES, getPage } from '@/content/registry'
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'QRfinity'

export function generateStaticParams() {
  return BARCODE_PAGES.filter((p) => p.barcode).map((p) => ({ slug: p.path.split('/').pop()! }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  return ogImage(getPage(`/barcode-generator/${(await params).slug}`))
}
