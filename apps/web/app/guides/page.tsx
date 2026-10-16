import { HubPage } from '@/components/content/HubPage'
import { getPage, GUIDES } from '@/content/registry'
import { pageMetadata } from '@/lib/seo'

const hub = getPage('/guides')
export const metadata = pageMetadata(hub)

export default function Page() {
  return <HubPage hub={hub} sections={[{ pages: GUIDES }]} />
}
