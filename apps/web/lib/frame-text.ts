'use client'

import type { TextOutline } from '@qrfinity/core'
import { unzlibSync } from 'fflate'
import { useEffect, useState } from 'react'

/**
 * Draws frame text as outlines, in any script, so PNG, SVG, PDF and EPS show exactly the same
 * letters without anyone needing our fonts. HarfBuzz shapes the text (joining Arabic, combining
 * Indic marks, kerning); the fonts are self-hosted from /fonts/frame (scripts/build-frame-fonts.mjs)
 * and only the slices holding the typed characters are downloaded.
 */

type Slice = { file: string; ranges: [number, number][] }
type Manifest = { family: string; slices: Slice[] }

export type FrameTextResult = { outline: TextOutline; missing: string[] }

type FamilyId =
  | 'arimo'
  | 'noto-sans-arabic'
  | 'noto-sans-devanagari'
  | 'noto-sans-bengali'
  | 'noto-sans-tamil'
  | 'noto-sans-thai'
  | 'noto-sans-sc'
  | 'noto-sans-tc'
  | 'noto-sans-jp'
  | 'noto-sans-kr'

const BASE = '/fonts/frame'

const inRange = (cp: number, ranges: [number, number][]) =>
  ranges.some(([a, b]) => cp >= a && cp <= b)

const ARABIC: [number, number][] = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x0870, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
]
const HANGUL: [number, number][] = [
  [0x1100, 0x11ff],
  [0x3130, 0x318f],
  [0xa960, 0xa97f],
  [0xac00, 0xd7ff],
]
const KANA: [number, number][] = [
  [0x3040, 0x30ff],
  [0x31f0, 0x31ff],
  [0xff66, 0xff9f],
]
const CJK: [number, number][] = [
  [0x2e80, 0x2fff],
  [0x3000, 0x303f],
  [0x3100, 0x312f],
  [0x31a0, 0x31bf],
  [0x3200, 0x9fff],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xffef],
  [0x20000, 0x3ffff],
]

/** Which Han glyph style to use: Japanese if there's kana, Traditional for zh-TW/HK/MO readers. */
function cjkFamily(text: string, locale: string): FamilyId {
  const cps = [...text].map((c) => c.codePointAt(0)!)
  if (cps.some((cp) => inRange(cp, KANA))) return 'noto-sans-jp'
  if (cps.some((cp) => inRange(cp, HANGUL)) && !cps.some((cp) => cp >= 0x4e00 && cp <= 0x9fff))
    return 'noto-sans-kr'
  if (/^zh-(tw|hk|mo|hant)/i.test(locale)) return 'noto-sans-tc'
  if (/^ja/i.test(locale)) return 'noto-sans-jp'
  if (/^ko/i.test(locale)) return 'noto-sans-kr'
  return 'noto-sans-sc'
}

/** Fonts to try for a character, in order. */
function familiesFor(cp: number, cjk: FamilyId): FamilyId[] {
  if (inRange(cp, ARABIC)) return ['noto-sans-arabic']
  if ((cp >= 0x0900 && cp <= 0x097f) || (cp >= 0xa8e0 && cp <= 0xa8ff))
    return ['noto-sans-devanagari']
  if (cp >= 0x0980 && cp <= 0x09ff) return ['noto-sans-bengali']
  if (cp >= 0x0b80 && cp <= 0x0bff) return ['noto-sans-tamil']
  if (cp >= 0x0e00 && cp <= 0x0e7f) return ['noto-sans-thai']
  if (inRange(cp, HANGUL)) return ['noto-sans-kr']
  if (inRange(cp, KANA)) return ['noto-sans-jp']
  if (inRange(cp, CJK)) return [cjk, 'noto-sans-sc', 'noto-sans-tc', 'noto-sans-jp', 'noto-sans-kr']
  return ['arimo', cjk]
}

const RTL = (cp: number) =>
  inRange(cp, ARABIC) || (cp >= 0x0590 && cp <= 0x05ff) || (cp >= 0xfb1d && cp <= 0xfb4f)
const LTR_STRONG = (cp: number) => /\p{L}/u.test(String.fromCodePoint(cp)) && !RTL(cp)

// ---------------------------------------------------------------------------
// Loading

const manifests = new Map<FamilyId, Promise<Manifest>>()
function manifest(id: FamilyId): Promise<Manifest> {
  let m = manifests.get(id)
  if (!m) {
    m = fetch(`${BASE}/${id}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ family: string; slices: { file: string; ranges: string }[] }>
      })
      .then((raw) => ({
        family: raw.family,
        slices: raw.slices.map((s) => ({
          file: s.file,
          ranges: s.ranges.split(',').map((r) => {
            const [a = '0', b = a] = r.split('-')
            return [parseInt(a, 16), parseInt(b, 16)] as [number, number]
          }),
        })),
      }))
    m.catch(() => manifests.delete(id))
    manifests.set(id, m)
  }
  return m
}

/** WOFF 1.0 → the plain font file inside (each table zlib-compressed, or stored as is). */
export function woffToSfnt(woff: Uint8Array): Uint8Array {
  const v = new DataView(woff.buffer, woff.byteOffset, woff.byteLength)
  if (v.getUint32(0) !== 0x774f4646) throw new Error('Not a WOFF file')
  const flavor = v.getUint32(4)
  const numTables = v.getUint16(12)
  const tables: { tag: number; checksum: number; data: Uint8Array }[] = []
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20
    const offset = v.getUint32(e + 4)
    const compLength = v.getUint32(e + 8)
    const origLength = v.getUint32(e + 12)
    const raw = woff.subarray(offset, offset + compLength)
    tables.push({
      tag: v.getUint32(e),
      checksum: v.getUint32(e + 16),
      data: compLength < origLength ? unzlibSync(raw) : raw,
    })
  }
  const pad = (n: number) => (n + 3) & ~3
  let size = 12 + 16 * numTables
  for (const t of tables) size += pad(t.data.length)
  const out = new Uint8Array(size)
  const o = new DataView(out.buffer)
  const entrySelector = Math.floor(Math.log2(numTables))
  const searchRange = 2 ** entrySelector * 16
  o.setUint32(0, flavor)
  o.setUint16(4, numTables)
  o.setUint16(6, searchRange)
  o.setUint16(8, entrySelector)
  o.setUint16(10, numTables * 16 - searchRange)
  let offset = 12 + 16 * numTables
  tables.forEach((t, i) => {
    const e = 12 + i * 16
    o.setUint32(e, t.tag)
    o.setUint32(e + 4, t.checksum)
    o.setUint32(e + 8, offset)
    o.setUint32(e + 12, t.data.length)
    out.set(t.data, offset)
    offset += pad(t.data.length)
  })
  return out
}

type HB = typeof import('harfbuzzjs')
let harfbuzz: Promise<HB> | null = null
const loadHarfbuzz = () => (harfbuzz ??= import('harfbuzzjs'))

type LoadedFont = { font: InstanceType<HB['Font']>; upem: number }
const fonts = new Map<string, Promise<LoadedFont>>()
function loadFont(file: string): Promise<LoadedFont> {
  let f = fonts.get(file)
  if (!f) {
    f = (async () => {
      const [hb, res] = await Promise.all([loadHarfbuzz(), fetch(`${BASE}/${file}`)])
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const sfnt = woffToSfnt(new Uint8Array(await res.arrayBuffer()))
      const face = new hb.Face(new hb.Blob(sfnt))
      return { font: new hb.Font(face), upem: face.upem }
    })()
    f.catch(() => fonts.delete(file))
    fonts.set(file, f)
  }
  return f
}

// ---------------------------------------------------------------------------
// Shaping

type Run = { text: string; file: string | null }

/** Splits text into runs that each come from one font file (null: no font has the character). */
async function itemize(text: string, locale: string): Promise<Run[]> {
  const cjk = cjkFamily(text, locale)
  const runs: Run[] = []
  let current: { run: Run; slice: Slice } | null = null
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    // Spaces and punctuation stay with the run they're in, so an Arabic phrase shapes as one.
    if (current && inRange(cp, current.slice.ranges) && !/\p{L}/u.test(ch)) {
      current.run.text += ch
      continue
    }
    let found: Slice | null = null
    for (const id of familiesFor(cp, cjk)) {
      found = (await manifest(id)).slices.find((s) => inRange(cp, s.ranges)) ?? null
      if (found) break
    }
    if (current && found && current.slice.file === found.file) {
      current.run.text += ch
    } else if (found) {
      const run = { text: ch, file: found.file }
      runs.push(run)
      current = { run, slice: found }
    } else {
      runs.push({ text: ch, file: null })
      current = null
    }
  }
  return runs
}

const round = (n: number) => Math.round(n * 10000) / 10000

/** Where a glyph is drawn: pen position and scale to em units, flipping y to point down. */
type DrawCtx = { parts: string[]; x: number; y: number; s: number; cx: number; cy: number }
const X = (c: DrawCtx, x: number) => round(c.x + x * c.s)
const Y = (c: DrawCtx, y: number) => round(c.y - y * c.s)

let sharedDraw: InstanceType<HB['DrawFuncs']> | null = null
/** One set of draw callbacks for every glyph (each set takes slots in the wasm function table). */
function drawFuncs(hb: HB) {
  if (sharedDraw) return sharedDraw
  const draw = new hb.DrawFuncs()
  const to = (c: DrawCtx, x: number, y: number) => {
    c.cx = x
    c.cy = y
  }
  draw.setMoveToFunc((x, y, d) => {
    const c = d as DrawCtx
    c.parts.push(`M${X(c, x)} ${Y(c, y)}`)
    to(c, x, y)
  })
  draw.setLineToFunc((x, y, d) => {
    const c = d as DrawCtx
    c.parts.push(`L${X(c, x)} ${Y(c, y)}`)
    to(c, x, y)
  })
  draw.setQuadraticToFunc((qx, qy, x, y, d) => {
    // Quadratic → cubic with the same curve (the EPS writer only knows cubics).
    const c = d as DrawCtx
    const c1x = c.cx + (2 / 3) * (qx - c.cx)
    const c1y = c.cy + (2 / 3) * (qy - c.cy)
    const c2x = x + (2 / 3) * (qx - x)
    const c2y = y + (2 / 3) * (qy - y)
    c.parts.push(`C${X(c, c1x)} ${Y(c, c1y)} ${X(c, c2x)} ${Y(c, c2y)} ${X(c, x)} ${Y(c, y)}`)
    to(c, x, y)
  })
  draw.setCubicToFunc((c1x, c1y, c2x, c2y, x, y, d) => {
    const c = d as DrawCtx
    c.parts.push(`C${X(c, c1x)} ${Y(c, c1y)} ${X(c, c2x)} ${Y(c, c2y)} ${X(c, x)} ${Y(c, y)}`)
    to(c, x, y)
  })
  draw.setClosePathFunc((d) => (d as DrawCtx).parts.push('Z'))
  sharedDraw = draw
  return draw
}

/** Shapes `text` into one outline in em units (see TextOutline). */
export async function shapeFrameText(text: string, locale = ''): Promise<FrameTextResult> {
  const hb = await loadHarfbuzz()
  const runs = await itemize(text, locale)
  // Short labels: the first strong character sets the direction; runs are reversed for RTL.
  const firstStrong = [...text]
    .map((c) => c.codePointAt(0)!)
    .find((cp) => RTL(cp) || LTR_STRONG(cp))
  const ordered = firstStrong !== undefined && RTL(firstStrong) ? [...runs].reverse() : runs

  const parts: string[] = []
  const missing: string[] = []
  let pen = 0
  const draw = drawFuncs(hb)

  for (const run of ordered) {
    if (!run.file) {
      missing.push(...run.text.replace(/\s/g, ''))
      continue
    }
    const { font, upem } = await loadFont(run.file)
    const buffer = new hb.Buffer()
    buffer.addText(run.text)
    buffer.guessSegmentProperties()
    hb.shape(font, buffer)
    const infos = buffer.getGlyphInfos()
    const positions = buffer.getGlyphPositions()
    const s = 1 / upem
    infos.forEach((g, i) => {
      const p = positions[i]!
      if (g.codepoint === 0) {
        const ch = [...run.text][g.cluster] ?? ''
        if (ch.trim()) missing.push(ch)
      } else {
        font.drawGlyph(g.codepoint, draw, {
          parts,
          x: pen + p.xOffset * s,
          y: -p.yOffset * s,
          s,
          cx: 0,
          cy: 0,
        } satisfies DrawCtx)
      }
      pen += p.xAdvance * s
    })
  }
  return { outline: { text, d: parts.join(''), advance: round(pen) }, missing }
}

export type FrameTextState = {
  outline: TextOutline | null
  /** Characters no bundled font can draw (left out of the code). */
  missing: string[]
  /** The outline for the current text isn't ready yet: downloads wait for it. */
  pending: boolean
}

/** Keeps the frame text's outline in step with what's typed. Empty text needs none. */
export function useFrameText(text: string): FrameTextState {
  const [result, setResult] = useState<{ text: string; value: FrameTextResult | null } | null>(null)
  useEffect(() => {
    if (!text) return
    let cancelled = false
    const timer = setTimeout(() => {
      shapeFrameText(text, navigator.language)
        .then((value) => !cancelled && setResult({ text, value }))
        .catch((e) => {
          // Fonts unavailable (offline): fall back to plain text in Helvetica.
          console.warn('Frame text could not be drawn as outlines.', e)
          if (!cancelled) setResult({ text, value: null })
        })
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text])
  if (!text) return { outline: null, missing: [], pending: false }
  if (!result || result.text !== text) return { outline: null, missing: [], pending: true }
  return {
    outline: result.value?.outline ?? null,
    missing: result.value?.missing ?? [],
    pending: false,
  }
}
