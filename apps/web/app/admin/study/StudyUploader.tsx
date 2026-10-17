'use client'

import { parseContent } from '@qrfinity/core'
import { Camera, ImagePlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useSyncExternalStore } from 'react'
import { decodeImageFile } from '@/lib/scan'
import { CATEGORY_LABEL, STUDY_CATEGORIES, type StudyCategory } from '@/lib/study'

type Item = {
  id: number
  name: string
  state: 'waiting' | 'reading' | 'saving' | 'done' | 'error'
  message: string
}

type Place = {
  category: StudyCategory
  city: string
  country: string
  takenOn: string
  notes: string
}

const PLACE_KEY = 'qrfinity-study-place'
const today = () => new Date().toISOString().slice(0, 10)
const MAX_SIDE = 2000

const fresh = (): Place => ({
  category: 'menu',
  city: '',
  country: '',
  takenOn: today(),
  notes: '',
})

/** Remembers the city, country and category on this device, so a walk needs no retyping. */
function loadPlace(): Place {
  const fallback = fresh()
  try {
    const saved = JSON.parse(localStorage.getItem(PLACE_KEY) ?? 'null') as Partial<Place> | null
    return saved ? { ...fallback, ...saved, takenOn: today(), notes: '' } : fallback
  } catch {
    return fallback
  }
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A JPEG no larger than 2,000 px on its longest side: plenty to see the code and its setting. */
async function smaller(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('resize'))), 'image/jpeg', 0.85),
    )
  } finally {
    bitmap.close()
  }
}

const field =
  'w-full rounded-md border-[1.5px] border-control-border bg-surface px-3 py-2.5 text-ink'

/**
 * Adds photos to the study, from a computer or straight from a phone's camera. Each photo is
 * read here; the server gets the photo (made smaller), a fingerprint of what the code holds,
 * its type and, for links, the address.
 */
export function StudyUploader({ storage }: { storage: boolean }) {
  // The saved place lives in this browser: after hydration the form starts again with it.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  return (
    <UploaderForm
      key={String(hydrated)}
      storage={storage}
      initial={hydrated ? loadPlace() : fresh()}
    />
  )
}

function UploaderForm({ storage, initial }: { storage: boolean; initial: Place }) {
  const router = useRouter()
  const [place, setPlace] = useState<Place>(initial)
  const [items, setItems] = useState<Item[]>([])
  const busy = useRef(false)
  const queue = useRef<{ id: number; file: File; place: Place }[]>([])
  const nextId = useRef(1)

  const update = (id: number, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  async function work() {
    if (busy.current) return
    busy.current = true
    while (queue.current.length) {
      const { id, file, place: p } = queue.current.shift()!
      try {
        update(id, { state: 'reading', message: 'Reading the code…' })
        const text = await decodeImageFile(file).catch(() => null)
        const photo = await smaller(file).catch(() => null)
        const form = new FormData()
        if (text === null) {
          form.set('contentType', 'unreadable')
        } else {
          const url = /^https?:\/\//i.test(text.trim()) ? text.trim() : ''
          form.set('fingerprint', await sha256(text))
          form.set('contentType', url ? 'url' : parseContent(text).type)
          if (url) form.set('url', url)
        }
        for (const [k, v] of Object.entries(p)) form.set(k, v)
        form.set('photoName', file.name)
        if (photo) form.set('photo', photo, 'photo.jpg')
        update(id, {
          state: 'saving',
          message: text === null ? 'No code found; saving the photo…' : 'Checking the link…',
        })
        const res = await fetch('/api/admin/study', { method: 'POST', body: form })
        const body = (await res.json().catch(() => ({}))) as {
          error?: string
          status?: 'added' | 'seen-before'
          reason?: string
          photoSaved?: boolean
        }
        if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status}).`)
        const seen = body.status === 'seen-before' ? 'Seen before, counted once. ' : ''
        const noPhoto = body.photoSaved ? '' : ' Photo not stored.'
        update(id, { state: 'done', message: `${seen}${body.reason ?? ''}${noPhoto}` })
      } catch (e) {
        update(id, { state: 'error', message: e instanceof Error ? e.message : 'Failed.' })
      }
    }
    busy.current = false
    router.refresh()
  }

  function add(files: FileList | null) {
    if (!files?.length) return
    const added = [...files].map((file) => ({ id: nextId.current++, file, place }))
    queue.current.push(...added)
    setItems((list) => [
      ...added.map(({ id, file }): Item => ({
        id,
        name: file.name,
        state: 'waiting',
        message: 'Waiting…',
      })),
      ...list,
    ])
    void work()
  }

  const set =
    <K extends keyof Place>(k: K) =>
    (v: Place[K]) => {
      const next = { ...place, [k]: v }
      setPlace(next)
      try {
        const { category, city, country } = next
        localStorage.setItem(PLACE_KEY, JSON.stringify({ category, city, country }))
      } catch {
        // Private browsing: nothing to remember.
      }
    }

  return (
    <section
      aria-labelledby="add-photos"
      className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-4 md:p-6"
    >
      <h2 id="add-photos" className="subheading text-ink">
        Add photos
      </h2>
      {!storage ? (
        <p role="note" className="body-small rounded-md bg-surface-sunk px-3 py-2 text-ink">
          Photo storage isn’t set up (S3_BUCKET and keys), so codes are recorded without their
          photos.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="label text-ink">Where it was</span>
          <select
            className={field}
            value={place.category}
            onChange={(e) => set('category')(e.target.value as StudyCategory)}
          >
            {STUDY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label text-ink">City</span>
          <input
            className={field}
            value={place.city}
            onChange={(e) => set('city')(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label text-ink">Country</span>
          <input
            className={field}
            value={place.country}
            placeholder="CA"
            onChange={(e) => set('country')(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label text-ink">Photo taken on</span>
          <input
            type="date"
            className={field}
            value={place.takenOn}
            onChange={(e) => set('takenOn')(e.target.value)}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="label text-ink">Notes (optional)</span>
        <input
          className={field}
          value={place.notes}
          placeholder="Faded poster dated 2023, peeling sticker…"
          onChange={(e) => set('notes')(e.target.value)}
        />
      </label>
      <p className="body-small text-ink-muted">
        These details go with the next photos you add. Don’t open the codes yourself; every link is
        followed here the same way.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="button inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-evergreen px-5 py-2.5 text-on-evergreen">
          <Camera aria-hidden="true" size={18} strokeWidth={1.75} />
          Take a photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              add(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
        <label className="button inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-[1.5px] border-control-border bg-surface px-5 py-2.5 text-ink">
          <ImagePlus aria-hidden="true" size={18} strokeWidth={1.75} />
          Choose photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              add(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {items.length ? (
        <ul aria-live="polite" className="body-small flex flex-col divide-y divide-hairline">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap gap-x-3 py-2">
              <span className="mono break-all text-ink">{i.name}</span>
              <span className={i.state === 'error' ? 'text-ink font-bold' : 'text-ink-muted'}>
                {i.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
