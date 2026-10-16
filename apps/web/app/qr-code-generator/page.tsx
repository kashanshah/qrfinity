import { HubPage } from '@/components/content/HubPage'
import { getPage, LANDINGS, USE_CASES } from '@/content/registry'
import { pageMetadata } from '@/lib/seo'

const hub = getPage('/qr-code-generator')
export const metadata = pageMetadata(hub)

export default function Page() {
  return (
    <HubPage
      hub={hub}
      sections={[
        { heading: 'What should your code do?', pages: USE_CASES },
        { heading: 'Dynamic codes and expiry', pages: LANDINGS },
      ]}
    />
  )
}
