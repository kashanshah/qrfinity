'use client'

import dynamic from 'next/dynamic'
import type { Folder, SlugUsage } from './CreateCode'

// Client-only: the homepage draft lives in sessionStorage, which the server can't read.
const CreateCode = dynamic(() => import('./CreateCode').then((m) => m.CreateCode), {
  ssr: false,
  loading: () => <p className="text-ink-muted">Loading the editor…</p>,
})

export function CreateCodeLoader(props: {
  shortLinkBase: string
  folders: Folder[]
  slugs: SlugUsage
}) {
  return <CreateCode {...props} />
}
