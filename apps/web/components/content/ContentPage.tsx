import { canBeDynamic, DEFAULT_FIELDS } from '@qrfinity/core'
import type { MDXComponents } from 'mdx/types'
import type { ReactNode } from 'react'
import { Generator } from '@/components/generator/Generator'
import { getPage, HOME, type ContentPage as Page } from '@/content/registry'
import type { ContentModule } from '@/content/load'
import { shortLinkBase } from '@/lib/short-link'
import { Breadcrumbs, type Crumb } from './Breadcrumbs'
import { Faq } from './Faq'
import { article, JsonLd, softwareApplication } from './JsonLd'
import { FactBlock } from './Prose'
import { RelatedLinks } from './RelatedLinks'

const HUB: Partial<Record<Page['kind'], string>> = {
  'use-case': '/qr-code-generator',
  guide: '/guides',
  alternative: '/alternatives',
}

/** Long-form pages use the brand heading scale: H2 = heading, H3 = subheading. */
const LONG_FORM: MDXComponents = {
  h2: (p) => <h2 className="heading mb-4 mt-12 scroll-mt-4 text-ink" {...p} />,
  h3: (p) => <h3 className="subheading mb-2 mt-8 text-ink" {...p} />,
}

export function crumbsFor(page: Page): Crumb[] {
  const hub = HUB[page.kind]
  return [
    { name: 'Home', path: HOME.path },
    ...(hub ? [{ name: getPage(hub).label, path: hub }] : []),
    { name: page.label, path: page.path },
  ]
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

/**
 * The shared template for use-case, landing, guide and comparison pages:
 * breadcrumbs, H1 and promise line, the preloaded generator (if any), the MDX body,
 * FAQ, related links and the fact block, plus structured data.
 */
export function ContentPage({
  page,
  content,
  tool,
}: {
  page: Page
  content: ContentModule
  /** A tool page's tool, shown where other pages show the generator. */
  tool?: ReactNode
}) {
  const Body = content.default
  const g = page.generator
  const dated = page.kind === 'guide' || page.kind === 'alternative' || page.kind === 'landing'
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-4 pt-6 md:px-6 md:pt-10">
      <Breadcrumbs items={crumbsFor(page)} />
      <header className="mb-8 mt-6 md:mb-10">
        <h1 className="page-title max-w-[22ch] text-ink">{page.h1}</h1>
        <p className="subheading mt-3 max-w-[60ch] text-ink-muted">{page.intro}</p>
        {dated ? (
          <p className="body-small mt-3 text-ink-muted">
            Last updated <time dateTime={page.updated}>{formatDate(page.updated)}</time>
          </p>
        ) : null}
      </header>

      {tool ? (
        <section aria-label={page.label} className="mb-12">
          {tool}
        </section>
      ) : null}

      {g ? (
        <section aria-label="QR code generator" className="mb-12">
          <Generator
            init={{ type: g.type, fields: g.fields, kind: g.kind }}
            kindChoice={canBeDynamic(g.type, { ...DEFAULT_FIELDS[g.type], ...g.fields?.[g.type] })}
            shortLinkBase={shortLinkBase()}
          />
        </section>
      ) : null}

      <article className="max-w-[760px]">
        <Body components={LONG_FORM} />
      </article>

      <div className="max-w-[960px]">
        <Faq items={content.faq ?? []} />
        <RelatedLinks
          related={page.related}
          guides={page.guides}
          relatedHeading={page.kind === 'alternative' ? 'Read next' : undefined}
        />
        <FactBlock />
      </div>

      <JsonLd
        data={
          page.kind === 'guide' || page.kind === 'alternative'
            ? article(page)
            : softwareApplication(page)
        }
      />
    </div>
  )
}
