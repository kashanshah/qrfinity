import { ContentPage } from '@/components/content/ContentPage'
import { QrReader } from '@/components/tools/QrReader'
import { loadContent } from '@/content/load'
import { getPage } from '@/content/registry'
import { pageMetadata } from '@/lib/seo'
import { shortLinkBase } from '@/lib/short-link'

const page = getPage('/qr-code-scanner')

export const metadata = pageMetadata(page)

export default async function Page() {
  return (
    <ContentPage
      page={page}
      content={await loadContent('tools', 'qr-code-scanner')}
      tool={<QrReader mode="scanner" shortLinkBase={shortLinkBase()} />}
    />
  )
}
