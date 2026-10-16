import type { MDXComponents } from 'mdx/types'
import type { ComponentType } from 'react'
import type { FaqItem } from '@/components/content/Faq'

export type ContentDir = 'use-cases' | 'guides' | 'alternatives' | 'landings' | 'tools' | 'pages'

export type ContentModule = {
  default: ComponentType<{ components?: MDXComponents }>
  /** Questions for the FAQ section and FAQPage structured data. */
  faq?: FaqItem[]
}

/** Loads a page's MDX body. Every file is compiled at build time; pages are statically rendered. */
export async function loadContent(dir: ContentDir, slug: string): Promise<ContentModule> {
  return (await import(`./${dir}/${slug}.mdx`)) as ContentModule
}
