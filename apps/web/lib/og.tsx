import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildScene, DEFAULT_DESIGN, sceneToSvg } from '@qrfinity/core'
import { ImageResponse } from 'next/og'
import tokens from '../../../brand/tokens.json'
import type { ContentPage } from '@/content/registry'
import { absoluteUrl } from './seo'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

/** Share images can't read CSS variables, so colours come straight from the token source. */
const color = (name: string) => {
  const t = tokens.color.tokens.find((c) => c.name === name)
  if (!t) throw new Error(`Unknown colour token ${name}`)
  return typeof t.value === 'string' ? t.value : t.value.light
}

const dataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const font = (file: string) => readFile(path.join(process.cwd(), 'assets/fonts', file))

/**
 * The Open Graph image for a page: H1, promise line, logo, and a real QR code (drawn by our own
 * renderer) that opens the page. Rendered once at build time.
 */
export async function ogImage(page: ContentPage) {
  const [display, sansMedium, sansBold, logo] = await Promise.all([
    font('bricolage-grotesque-latin-800-normal.ttf'),
    font('manrope-latin-500-normal.ttf'),
    font('manrope-latin-700-normal.ttf'),
    readFile(path.join(process.cwd(), 'public/brand/qrfinity-logo.svg'), 'utf8'),
  ])
  const evergreen = color('evergreen')
  const qr = sceneToSvg(
    buildScene(absoluteUrl(page.path), {
      ...DEFAULT_DESIGN,
      foreground: { type: 'solid', color: evergreen },
      quietZone: 2,
    }).scene,
    { width: 360 },
  )

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: color('ground'),
        padding: 64,
        gap: 56,
        fontFamily: 'Manrope',
        color: color('ink'),
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'space-between',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri(logo)} alt="" width={183} height={48} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              fontFamily: 'Bricolage Grotesque',
              fontSize: page.h1.length > 40 ? 56 : 64,
              lineHeight: 1.05,
              letterSpacing: -1.5,
            }}
          >
            {page.h1}
          </div>
          <div
            style={{ fontSize: 28, lineHeight: 1.35, color: color('ink-muted'), fontWeight: 500 }}
          >
            {page.intro}
          </div>
        </div>
        <div style={{ display: 'flex' }}>
          <div
            style={{
              display: 'flex',
              background: color('mint'),
              borderRadius: 999,
              padding: '10px 22px',
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            Free. Never expires.
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignSelf: 'center',
          background: color('surface'),
          borderRadius: 24,
          padding: 24,
          border: `2px solid ${color('hairline')}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri(qr)} alt="" width={360} height={360} />
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Bricolage Grotesque', data: display, weight: 800, style: 'normal' },
        { name: 'Manrope', data: sansMedium, weight: 500, style: 'normal' },
        { name: 'Manrope', data: sansBold, weight: 700, style: 'normal' },
      ],
    },
  )
}
