// Builds the platform icons the generator puts in the middle of a code by default (WhatsApp,
// Instagram, app stores…). Each is the brand's single-colour mark from Simple Icons (CC0 data;
// the marks remain their owners' trademarks), in the brand's own colour on a rounded tile.
//
// The icons go into codes as vector paths, so SVG, PDF and EPS downloads stay sharp at any size.
// The EPS writer reads only absolute M, L, C and Z commands, so every path is rewritten to those
// here, with the tile's top-left corner at 0,0.
//
// Run after changing the list or upgrading simple-icons: node scripts/build-brand-icons.mjs
// The ids must match BRAND_ICONS in packages/core/src/content/brands.ts (a test checks this).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as si from 'simple-icons'
import svgpath from 'svgpath'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'brand-icons')

/** id → Simple Icons export, plus overrides where the plain mark wouldn't read on white. */
const ICONS = {
  whatsapp: { icon: si.siWhatsapp },
  instagram: { icon: si.siInstagram },
  facebook: { icon: si.siFacebook },
  x: { icon: si.siX },
  tiktok: { icon: si.siTiktok },
  // Douyin is ByteDance's Chinese TikTok and uses the same note mark.
  douyin: { icon: si.siTiktok },
  youtube: { icon: si.siYoutube },
  threads: { icon: si.siThreads },
  pinterest: { icon: si.siPinterest },
  telegram: { icon: si.siTelegram },
  line: { icon: si.siLine },
  // The mark is a yellow square with the speech bubble cut out; the bubble shows KakaoTalk's
  // dark brown, as on its app icon.
  kakaotalk: { icon: si.siKakaotalk, fullBleed: true, under: '#3A1D1D' },
  weibo: { icon: si.siSinaweibo },
  bilibili: { icon: si.siBilibili },
  // The mark is the wordmark alone; its app icon is the white wordmark on red.
  xiaohongshu: { icon: si.siXiaohongshu, bg: '#FF2442', mark: '#FFFFFF' },
  wechat: { icon: si.siWechat },
  spotify: { icon: si.siSpotify },
  appstore: { icon: si.siAppstore },
  googleplay: { icon: si.siGoogleplay },
  discord: { icon: si.siDiscord },
  reddit: { icon: si.siReddit },
}

/** Rounded rectangle as a path (k ≈ 0.5523 makes a quarter circle from one cubic). */
function roundedRect(x, y, w, h, r) {
  const k = r * 0.5523
  return [
    `M${x + r} ${y}`,
    `H${x + w - r}`,
    `C${x + w - r + k} ${y} ${x + w} ${y + r - k} ${x + w} ${y + r}`,
    `V${y + h - r}`,
    `C${x + w} ${y + h - r + k} ${x + w - r + k} ${y + h} ${x + w - r} ${y + h}`,
    `H${x + r}`,
    `C${x + r - k} ${y + h} ${x} ${y + h - r + k} ${x} ${y + h - r}`,
    `V${y + r}`,
    `C${x} ${y + r - k} ${x + r - k} ${y} ${x + r} ${y}`,
    'Z',
  ].join('')
}

/** Absolute M/L/C/Z only, one letter per segment, moved by (dx, dy), rounded to 3 decimals. */
function normalize(d, dx, dy) {
  const path = svgpath(d)
    .abs()
    .unarc()
    .unshort()
    .iterate((seg, _i, x, y) => {
      switch (seg[0]) {
        case 'H':
          return [['L', seg[1], y]]
        case 'V':
          return [['L', x, seg[1]]]
        case 'Q': {
          // Quadratic → cubic with the same curve.
          const [, qx, qy, ex, ey] = seg
          return [
            [
              'C',
              x + (2 / 3) * (qx - x),
              y + (2 / 3) * (qy - y),
              ex + (2 / 3) * (qx - ex),
              ey + (2 / 3) * (qy - ey),
              ex,
              ey,
            ],
          ]
        }
        default:
          return [seg]
      }
    })
    .translate(dx, dy)
    .round(3)
  // svgpath's toString drops repeated letters ("C 1 2 … 7 8 …"); the EPS writer needs each one.
  return path.segments.map((seg) => seg[0] + seg.slice(1).join(' ')).join('')
}

function iconSvg({ icon, fullBleed = false, under, bg = '#FFFFFF', mark = `#${icon.hex}` }) {
  // Tile and mark: the mark is drawn on a 24-unit grid; the tile adds 3 units around it.
  const pad = fullBleed ? 0 : 3
  const size = 24 + pad * 2
  const tile = fullBleed ? roundedRect(0, 0, 24, 24, 1.875) : roundedRect(0, 0, size, size, 6)
  const paths = [
    { d: normalize(tile, 0, 0), fill: fullBleed ? under : bg },
    { d: normalize(icon.path, pad, pad), fill: mark },
  ]
  for (const p of paths) {
    if (!/^[MLCZ0-9.,\s-]+$/.test(p.d)) throw new Error(`${icon.title}: unexpected path command`)
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><title>${icon.title}</title>` +
    paths.map((p) => `<path fill="${p.fill.toLowerCase()}" d="${p.d}"/>`).join('') +
    `</svg>\n`
  )
}

mkdirSync(out, { recursive: true })
for (const [id, spec] of Object.entries(ICONS)) {
  writeFileSync(join(out, `${id}.svg`), iconSvg(spec))
}
console.log(`Wrote ${Object.keys(ICONS).length} icons to ${out}`)
