import { advancedCodeUsage, listFolders } from '@/lib/server/codes'
import { serviceContext } from '@/lib/server/context'
import { shortLinkBase } from '@/lib/short-link'
import { CreateCodeLoader } from './CreateCodeLoader'

export default async function NewCodePage() {
  const ctx = await serviceContext('/dashboard/new')
  const [folders, slugs] = await Promise.all([listFolders(ctx), advancedCodeUsage(ctx)])
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="heading text-ink">New dynamic code</h1>
        <p className="mt-1 max-w-[65ch] text-ink-muted">
          The printed code holds a short link. Change where it goes any time, see scan stats, and it
          never stops working.
        </p>
      </div>
      <CreateCodeLoader
        shortLinkBase={shortLinkBase()}
        folders={folders.map((f) => ({ id: f.id, name: f.name }))}
        slugs={slugs}
      />
    </div>
  )
}
