import { ContentPage } from '@/components/content/ContentPage'
import { loadContent } from '@/content/load'
import { getPage } from '@/content/registry'
import { pageMetadata } from '@/lib/seo'

const page = getPage('/dynamic-qr-code-generator')

export const metadata = pageMetadata(page)

export default async function Page() {
  return (
    <ContentPage page={page} content={await loadContent('landings', 'dynamic-qr-code-generator')} />
  )
}
