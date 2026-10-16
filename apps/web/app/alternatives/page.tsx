import { HubPage } from '@/components/content/HubPage'
import { ALTERNATIVES, getPage } from '@/content/registry'
import { pageMetadata } from '@/lib/seo'

const hub = getPage('/alternatives')
export const metadata = pageMetadata(hub)

export default function Page() {
  return (
    <HubPage hub={hub} sections={[{ pages: ALTERNATIVES }]}>
      <p className="body-small mb-6 max-w-[72ch] text-ink-muted">
        We check competitors’ own pricing and help pages and link every claim to its source. Prices
        and plans change; if you spot something out of date, email hello@qrfinity.com and we’ll fix
        it.
      </p>
    </HubPage>
  )
}
