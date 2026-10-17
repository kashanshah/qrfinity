/** Test helper: rasterise an SVG with resvg and decode it with zxing-cpp (wasm). */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Resvg } from '@resvg/resvg-js'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'

const require = createRequire(import.meta.url)
const wasm = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'))
prepareZXingModule({
  overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) },
})

export async function decodeSvg(
  svg: string,
  width = 400,
  formats: string[] = ['QRCode'],
): Promise<string | null> {
  const img = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: '#ffffff',
  }).render()
  const results = await readBarcodes(
    {
      data: new Uint8ClampedArray(img.pixels),
      width: img.width,
      height: img.height,
      colorSpace: 'srgb',
    } as ImageData,
    { formats: formats as never, tryHarder: true },
  )
  return results.find((r) => r.isValid)?.text ?? null
}
