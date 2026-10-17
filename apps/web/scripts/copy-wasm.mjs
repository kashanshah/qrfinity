// Self-host zxing: copy the decoder (scan check) and the writer (2D barcodes) wasm into public/,
// so neither ever calls a CDN.
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'wasm')
mkdirSync(outDir, { recursive: true })
for (const file of ['reader/zxing_reader.wasm', 'writer/zxing_writer.wasm'])
  copyFileSync(require.resolve(`zxing-wasm/${file}`), join(outDir, file.split('/')[1]))
