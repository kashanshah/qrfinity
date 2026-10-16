import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ContentPage } from '@/components/content/ContentPage'
import { loadContent } from '@/content/load'
import { USE_CASES, findPage } from '@/content/registry'
import { pageMetadata } from '@/lib/seo'

export const dynamicParams = false

export function generateStaticParams() {
  return USE_CASES.map((p) => ({ slug: p.path.split('/').pop()! }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = findPage(`/qr-code-generator/${(await params).slug}`)
  return page ? pageMetadata(page) : {}
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const page = findPage(`/qr-code-generator/${slug}`)
  if (!page) notFound()
  return <ContentPage page={page} content={await loadContent('use-cases', slug)} />
}
