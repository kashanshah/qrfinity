import { getPage } from '@/content/registry'
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = getPage('/qr-code-redirect').title

export default function Image() {
  return ogImage(getPage('/qr-code-redirect'))
}
