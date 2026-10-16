import { ContentPage } from '@/components/content/ContentPage'
import { loadContent } from '@/content/load'
import { getPage } from '@/content/registry'
import { pageMetadata } from '@/lib/seo'

const page = getPage('/password-protected-qr-code')

export const metadata = pageMetadata(page)

export default async function Page() {
  return (
    <ContentPage
      page={page}
      content={await loadContent('landings', 'password-protected-qr-code')}
    />
  )
}
