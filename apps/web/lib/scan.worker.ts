/// <reference lib="webworker" />
// Decodes the rendered code with zxing-cpp (WebAssembly), off the main thread.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? `/wasm/${path}` : prefix + path,
  },
})

self.onmessage = async (
  event: MessageEvent<{
    id: number
    image: ImageData
    photo?: boolean
    detail?: boolean
    /** zxing format names; QR codes by default. Barcodes ask for 'AllLinear'. */
    formats?: string[]
  }>,
) => {
  const { id, image, photo, detail, formats } = event.data
  try {
    const results = await readBarcodes(image, {
      formats: (formats ?? ['QRCode']) as never,
      tryHarder: true,
      maxNumberOfSymbols: 1,
      // Photos and screenshots of printed codes: turned, light-on-dark or tiny in a big frame.
      ...(photo ? { tryRotate: true, tryInvert: true, tryDownscale: true } : {}),
    })
    const hit = results.find((r) => r.isValid)
    self.postMessage({
      id,
      text: hit ? hit.text : null,
      // The QR code tester also wants where the code is and how it was made.
      ...(detail && hit
        ? {
            info: {
              ecLevel: hit.ecLevel,
              version: hit.version,
              inverted: hit.isInverted,
              position: hit.position,
            },
          }
        : {}),
    })
  } catch (error) {
    self.postMessage({ id, text: null, error: String(error) })
  }
}
