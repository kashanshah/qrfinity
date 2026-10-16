import type { ReactNode } from 'react'
import { HOME, type ContentPage } from '@/content/registry'
import { Breadcrumbs } from './Breadcrumbs'
import { FactBlock } from './Prose'
import { PageGrid } from './PageGrid'

export function HubPage({
  hub,
  sections,
  children,
}: {
  hub: ContentPage
  sections: { heading?: string; pages: ContentPage[] }[]
  children?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-4 pt-6 md:px-6 md:pt-10">
      <Breadcrumbs
        items={[
          { name: 'Home', path: HOME.path },
          { name: hub.label, path: hub.path },
        ]}
      />
      <header className="mb-8 mt-6 md:mb-10">
        <h1 className="page-title max-w-[22ch] text-ink">{hub.h1}</h1>
        <p className="subheading mt-3 max-w-[60ch] text-ink-muted">{hub.intro}</p>
      </header>
      {sections.map((s, i) => (
        <section key={s.heading ?? i} className="mb-10">
          {s.heading ? <h2 className="heading mb-4 text-ink">{s.heading}</h2> : null}
          <PageGrid pages={s.pages} />
        </section>
      ))}
      {children}
      <div className="max-w-[960px]">
        <FactBlock />
      </div>
    </div>
  )
}
