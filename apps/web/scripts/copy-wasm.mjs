// Self-host the zxing decoder: copy its wasm into public/ so the scan check never calls a CDN.
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const src = require.resolve('zxing-wasm/reader/zxing_reader.wasm')
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'wasm')
mkdirSync(outDir, { recursive: true })
copyFileSync(src, join(outDir, 'zxing_reader.wasm'))
