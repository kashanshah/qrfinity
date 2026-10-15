/// <reference lib="webworker" />
// Decodes the rendered code with zxing-cpp (WebAssembly), off the main thread.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? `/wasm/${path}` : prefix + path,
  },
})

self.onmessage = async (event: MessageEvent<{ id: number; image: ImageData }>) => {
  const { id, image } = event.data
  try {
    const results = await readBarcodes(image, {
      formats: ['QRCode'],
      tryHarder: true,
      maxNumberOfSymbols: 1,
    })
    const hit = results.find((r) => r.isValid)
    self.postMessage({ id, text: hit ? hit.text : null })
  } catch (error) {
    self.postMessage({ id, text: null, error: String(error) })
  }
}
