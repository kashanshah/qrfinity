import type { MDXComponents } from 'mdx/types'
import Link from 'next/link'

/** Styles for MDX content pages, using brand text styles and tokens. */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (p) => <h1 className="heading mb-2 text-ink" {...p} />,
    h2: (p) => <h2 className="subheading mb-3 mt-10 text-ink" {...p} />,
    h3: (p) => <h3 className="mb-2 mt-6 font-bold text-ink" {...p} />,
    p: (p) => <p className="mb-4 text-ink" {...p} />,
    ul: (p) => <ul className="mb-4 list-disc space-y-1 pl-6 text-ink" {...p} />,
    ol: (p) => <ol className="mb-4 list-decimal space-y-1 pl-6 text-ink" {...p} />,
    strong: (p) => <strong className="font-bold" {...p} />,
    a: ({ href = '', ...p }) =>
      href.startsWith('/') ? (
        <Link href={href} className="text-evergreen underline" {...p} />
      ) : (
        <a href={href} className="text-evergreen underline" {...p} />
      ),
    ...components,
  }
}
