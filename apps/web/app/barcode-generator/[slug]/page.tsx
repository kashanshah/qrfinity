import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarcodeGenerator } from '@/components/barcode/BarcodeGenerator'
import { ContentPage } from '@/components/content/ContentPage'
import { loadContent } from '@/content/load'
import { BARCODE_PAGES, findPage } from '@/content/registry'
import { pageMetadata } from '@/lib/seo'

export const dynamicParams = false

export function generateStaticParams() {
  return BARCODE_PAGES.map((p) => ({ slug: p.path.split('/').pop()! }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = findPage(`/barcode-generator/${(await params).slug}`)
  return page ? pageMetadata(page) : {}
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const page = findPage(`/barcode-generator/${slug}`)
  if (!page?.barcode) notFound()
  return (
    <ContentPage
      page={page}
      content={await loadContent('barcodes', slug)}
      tool={<BarcodeGenerator initialType={page.barcode} />}
    />
  )
}
