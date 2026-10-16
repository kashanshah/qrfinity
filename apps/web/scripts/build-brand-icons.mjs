// Builds the platform icons the generator puts in the middle of a code by default (WhatsApp,
// Instagram, app stores…). Each is the brand's single-colour mark from Simple Icons (CC0 data;
// the marks remain their owners' trademarks), in the brand's own colour on a white rounded tile.
// Run after changing the list or upgrading simple-icons: node scripts/build-brand-icons.mjs
// The ids must match BRAND_ICONS in packages/core/src/content/brands.ts (a test checks this).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as si from 'simple-icons'

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
  xiaohongshu: { icon: si.siXiaohongshu, bg: '#FF2442', mark: '#ffffff' },
  wechat: { icon: si.siWechat },
  spotify: { icon: si.siSpotify },
  appstore: { icon: si.siAppstore },
  googleplay: { icon: si.siGoogleplay },
  discord: { icon: si.siDiscord },
  reddit: { icon: si.siReddit },
}

// Drawn at 512 px in the browser; the size attributes give the image an intrinsic size.
const SIZE = 512

function tile({ icon, fullBleed = false, under, bg = '#ffffff', mark = `#${icon.hex}` }) {
  const body = fullBleed
    ? `<rect width="24" height="24" rx="1.875" fill="${under}"/><path fill="${mark}" d="${icon.path}"/>`
    : `<rect x="-3" y="-3" width="30" height="30" rx="6" fill="${bg}"/><path fill="${mark}" d="${icon.path}"/>`
  const viewBox = fullBleed ? '0 0 24 24' : '-3 -3 30 30'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="${viewBox}"><title>${icon.title}</title>${body}</svg>\n`
}

mkdirSync(out, { recursive: true })
for (const [id, spec] of Object.entries(ICONS)) {
  writeFileSync(join(out, `${id}.svg`), tile(spec))
}
console.log(`Wrote ${Object.keys(ICONS).length} icons to ${out}`)
