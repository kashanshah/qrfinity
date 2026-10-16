/// <reference lib="webworker" />
// Decodes the rendered code with zxing-cpp (WebAssembly), off the main thread.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? `/wasm/${path}` : prefix + path,
  },
})

self.onmessage = async (event: MessageEvent<{ id: number; image: ImageData; photo?: boolean }>) => {
  const { id, image, photo } = event.data
  try {
    const results = await readBarcodes(image, {
      formats: ['QRCode'],
      tryHarder: true,
      maxNumberOfSymbols: 1,
      // Photos and screenshots of printed codes: turned, light-on-dark or tiny in a big frame.
      ...(photo ? { tryRotate: true, tryInvert: true, tryDownscale: true } : {}),
    })
    const hit = results.find((r) => r.isValid)
    self.postMessage({ id, text: hit ? hit.text : null })
  } catch (error) {
    self.postMessage({ id, text: null, error: String(error) })
  }
}
