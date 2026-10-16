import { ContentPage } from '@/components/content/ContentPage'
import { loadContent } from '@/content/load'
import { getPage } from '@/content/registry'
import { pageMetadata } from '@/lib/seo'

const page = getPage('/qr-code-redirect')

export const metadata = pageMetadata(page)

export default async function Page() {
  return <ContentPage page={page} content={await loadContent('landings', 'qr-code-redirect')} />
}
