// Self-hosts the fonts that frame text is drawn with, in every script we support: the bold (700)
// weight from Fontsource packages (SIL OFL 1.1), as WOFF 1.0, which the browser unpacks for
// HarfBuzz. Chinese, Japanese and Korean come in ~100 slices of ~40 KB each, so the generator
// downloads only the slices for the characters someone types.
//
// Writes public/fonts/frame/<id>/*.woff, each family's OFL licence, and <id>.json listing every
// file with the code points it covers. Run after changing the list or a version (needs npm):
//   node scripts/build-frame-fonts.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts', 'frame')

/** id → Fontsource package, version, and which subsets to keep ('numbered' = the CJK slices). */
const FAMILIES = {
  arimo: {
    version: '5.3.0',
    subsets: [
      'latin',
      'latin-ext',
      'greek',
      'greek-ext',
      'cyrillic',
      'cyrillic-ext',
      'vietnamese',
      'hebrew',
    ],
  },
  'noto-sans-arabic': { version: '5.3.0', subsets: ['arabic'] },
  'noto-sans-devanagari': { version: '5.3.0', subsets: ['devanagari'] },
  'noto-sans-bengali': { version: '5.3.0', subsets: ['bengali'] },
  'noto-sans-tamil': { version: '5.3.0', subsets: ['tamil'] },
  'noto-sans-thai': { version: '5.3.0', subsets: ['thai'] },
  'noto-sans-sc': { version: '5.3.1', subsets: 'numbered' },
  'noto-sans-tc': { version: '5.3.1', subsets: 'numbered' },
  'noto-sans-jp': { version: '5.3.1', subsets: 'numbered' },
  'noto-sans-kr': { version: '5.3.1', subsets: 'numbered' },
}

/** "U+0020-007E,U+00A0" → "20-7e,a0" */
const compactRanges = (s) =>
  s
    .split(',')
    .map((r) => r.trim().replace(/^U\+/i, '').toLowerCase())
    .join(',')

const tmp = mkdtempSync(join(tmpdir(), 'frame-fonts-'))
try {
  rmSync(out, { recursive: true, force: true })
  for (const [id, { version, subsets }] of Object.entries(FAMILIES)) {
    const tgz = execFileSync('npm', ['pack', '-q', `@fontsource/${id}@${version}`], {
      cwd: tmp,
      encoding: 'utf8',
    }).trim()
    const dir = join(tmp, id)
    mkdirSync(dir)
    execFileSync('tar', ['xzf', join(tmp, tgz), '-C', dir])
    const pkg = join(dir, 'package')
    const unicode = JSON.parse(readFileSync(join(pkg, 'unicode.json'), 'utf8'))
    const keys = Object.keys(unicode).filter((k) =>
      subsets === 'numbered' ? /^\[\d+\]$/.test(k) : subsets.includes(k),
    )
    mkdirSync(join(out, id), { recursive: true })
    const slices = keys.map((key) => {
      const name = key.replace(/^\[(\d+)\]$/, '$1')
      const file = `${id}-${name}-700-normal.woff`
      copyFileSync(join(pkg, 'files', file), join(out, id, file))
      return { file: `${id}/${file}`, ranges: compactRanges(unicode[key]) }
    })
    copyFileSync(join(pkg, 'LICENSE'), join(out, id, 'LICENSE.txt'))
    writeFileSync(join(out, `${id}.json`), JSON.stringify({ family: id, version, slices }) + '\n')
    console.log(`${id}: ${slices.length} files`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
