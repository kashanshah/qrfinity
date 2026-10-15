/**
 * Path building in module units. Paths use only absolute M, L, C and Z so the
 * same data can be written as SVG and as PostScript (EPS).
 */

const KAPPA = 0.5522847498

export function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

export class PathBuilder {
  private parts: string[] = []

  move(x: number, y: number) {
    this.parts.push(`M${fmt(x)} ${fmt(y)}`)
    return this
  }
  line(x: number, y: number) {
    this.parts.push(`L${fmt(x)} ${fmt(y)}`)
    return this
  }
  curve(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    this.parts.push(`C${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(x)} ${fmt(y)}`)
    return this
  }
  close() {
    this.parts.push('Z')
    return this
  }

  /**
   * Rectangle with independent corner radii [top-left, top-right, bottom-right, bottom-left],
   * drawn clockwise.
   */
  roundedRect(x: number, y: number, w: number, h: number, radii: [number, number, number, number]) {
    const max = Math.min(w, h) / 2
    const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, max))) as [
      number,
      number,
      number,
      number,
    ]
    const k = KAPPA
    this.move(x + tl, y)
    this.line(x + w - tr, y)
    if (tr) this.curve(x + w - tr + tr * k, y, x + w, y + tr - tr * k, x + w, y + tr)
    this.line(x + w, y + h - br)
    if (br) this.curve(x + w, y + h - br + br * k, x + w - br + br * k, y + h, x + w - br, y + h)
    this.line(x + bl, y + h)
    if (bl) this.curve(x + bl - bl * k, y + h, x, y + h - bl + bl * k, x, y + h - bl)
    this.line(x, y + tl)
    if (tl) this.curve(x, y + tl - tl * k, x + tl - tl * k, y, x + tl, y)
    return this.close()
  }

  rect(x: number, y: number, w: number, h: number) {
    return this.move(x, y)
      .line(x + w, y)
      .line(x + w, y + h)
      .line(x, y + h)
      .close()
  }

  circle(cx: number, cy: number, r: number) {
    return this.roundedRect(cx - r, cy - r, 2 * r, 2 * r, [r, r, r, r])
  }

  diamond(x: number, y: number, w: number, h: number) {
    return this.move(x + w / 2, y)
      .line(x + w, y + h / 2)
      .line(x + w / 2, y + h)
      .line(x, y + h / 2)
      .close()
  }

  isEmpty() {
    return this.parts.length === 0
  }

  toString() {
    return this.parts.join('')
  }
}
