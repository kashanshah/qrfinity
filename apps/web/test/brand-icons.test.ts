import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BRAND_ICONS, sanitizeDesign } from '@qrfinity/core'
import { describe, expect, it } from 'vitest'

const dir = fileURLToPath(new URL('../public/brand-icons', import.meta.url))

describe('platform icons', () => {
  it('has a file for every icon the generator can pick, and no extras', () => {
    const files = readdirSync(dir).map((f) => f.replace(/\.svg$/, ''))
    expect(files.sort()).toEqual(Object.keys(BRAND_ICONS).sort())
  })

  it('each file is a vector logo the design accepts unchanged', () => {
    for (const id of Object.keys(BRAND_ICONS)) {
      const svg = readFileSync(`${dir}/${id}.svg`, 'utf8')
      const [, , width, height] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(' ').map(Number)
      const paths = [...svg.matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g)].map((m) => ({
        d: m[2]!,
        fill: m[1]!,
      }))
      const logo = { type: 'vector', width, height, paths }
      expect(paths.length, id).toBeGreaterThan(1)
      expect(sanitizeDesign({ logo }).logo, id).toEqual(logo)
    }
  })
})
