import { STUDY_CATEGORIES } from '@/lib/study'
import { adminContextOrNull } from '@/lib/server/context'
import { ServiceError } from '@/lib/server/errors'
import { addStudyPhoto, MAX_PHOTO_BYTES } from '@/lib/server/study'

export const dynamic = 'force-dynamic'
// A new code's link is followed before answering: allow for slow sites.
export const maxDuration = 60

const text = (f: FormData, name: string) => {
  const v = f.get(name)
  return typeof v === 'string' ? v : ''
}

/**
 * Adds one photo to the dead QR codes study (admins only). The browser has already read the code:
 * it sends the content's fingerprint and type, the link if there is one, the category and place,
 * and the photo (made smaller first).
 */
export async function POST(req: Request) {
  const ctx = await adminContextOrNull()
  if (!ctx) return Response.json({ error: 'Not found' }, { status: 404 })
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'Send the photo as a form upload.' }, { status: 400 })
  }
  const file = form.get('photo')
  const photo =
    file instanceof File && file.size > 0
      ? file.size > MAX_PHOTO_BYTES
        ? null
        : { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type }
      : null
  if (file instanceof File && file.size > MAX_PHOTO_BYTES)
    return Response.json({ error: 'That photo is too large (4 MB at most).' }, { status: 413 })
  const category = text(form, 'category')
  try {
    const result = await addStudyPhoto(
      ctx,
      {
        fingerprint: text(form, 'fingerprint'),
        photoName: text(form, 'photoName'),
        contentType: text(form, 'contentType') || 'unreadable',
        url: text(form, 'url') || null,
        category: (STUDY_CATEGORIES as readonly string[]).includes(category) ? category : '',
        city: text(form, 'city'),
        country: text(form, 'country'),
        takenOn: text(form, 'takenOn'),
        notes: text(form, 'notes'),
      },
      photo,
    )
    return Response.json(result)
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: e.message }, { status: 400 })
    console.error(e)
    return Response.json(
      { error: 'That photo couldn’t be saved. Check the logs.' },
      { status: 500 },
    )
  }
}
