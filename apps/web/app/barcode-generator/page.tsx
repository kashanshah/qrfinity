import { BarcodeGenerator } from '@/components/barcode/BarcodeGenerator'
import { ContentPage } from '@/components/content/ContentPage'
import { loadContent } from '@/content/load'
import { BARCODE_HOME } from '@/content/registry'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata(BARCODE_HOME)

export default async function Page() {
  return (
    <ContentPage
      page={BARCODE_HOME}
      content={await loadContent('barcodes', 'barcode-generator')}
      tool={<BarcodeGenerator initialType="code128" />}
    />
  )
}
