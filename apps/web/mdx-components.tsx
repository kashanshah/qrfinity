import type { MDXComponents } from 'mdx/types'
import Link from 'next/link'
import { Callout, FactBlock, Recommendation, Screenshot } from '@/components/content/Prose'

/** Styles for MDX content pages, using brand text styles and tokens. */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (p) => <h1 className="heading mb-2 text-ink" {...p} />,
    h2: (p) => <h2 className="subheading mb-3 mt-10 text-ink" {...p} />,
    h3: (p) => <h3 className="mb-2 mt-6 font-bold text-ink" {...p} />,
    p: (p) => <p className="mb-4 max-w-[72ch] text-ink" {...p} />,
    ul: (p) => <ul className="mb-4 max-w-[72ch] list-disc space-y-1 pl-6 text-ink" {...p} />,
    ol: (p) => <ol className="mb-4 max-w-[72ch] list-decimal space-y-2 pl-6 text-ink" {...p} />,
    strong: (p) => <strong className="font-bold" {...p} />,
    code: (p) => <code className="rounded-sm bg-surface-sunk px-1 font-mono text-[0.9em]" {...p} />,
    table: (p) => (
      <div className="my-6 overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[480px] border-collapse bg-surface text-left" {...p} />
      </div>
    ),
    th: (p) => (
      <th
        className="label border-b border-hairline bg-surface-sunk px-3 py-2 align-bottom font-bold text-ink"
        {...p}
      />
    ),
    td: (p) => (
      <td className="body-small border-b border-hairline px-3 py-2 align-top text-ink" {...p} />
    ),
    a: ({ href = '', ...p }) =>
      href.startsWith('/') ? (
        <Link href={href} className="text-evergreen underline" {...p} />
      ) : (
        <a href={href} className="text-evergreen underline" rel="noopener" {...p} />
      ),
    Callout,
    FactBlock,
    Recommendation,
    Screenshot,
    ...components,
  }
}
