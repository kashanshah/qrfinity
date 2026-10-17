import { adminContextOrNull } from '@/lib/server/context'
import { studyPhotoFile } from '@/lib/server/study'

export const dynamic = 'force-dynamic'

/** A study photo from the private file store, for admins only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminContextOrNull()
  const { id } = await params
  if (!ctx || !/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 })
  const file = await studyPhotoFile(ctx.db, id)
  if (!file) return new Response('Not found', { status: 404 })
  return new Response(file.body, {
    headers: {
      'Content-Type': file.contentType,
      // Private: never kept by a shared cache.
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
