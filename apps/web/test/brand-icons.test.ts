import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BRAND_ICONS } from '@qrfinity/core'
import { describe, expect, it } from 'vitest'

describe('platform icons', () => {
  it('has a file for every icon the generator can pick, and no extras', () => {
    const dir = fileURLToPath(new URL('../public/brand-icons', import.meta.url))
    const files = readdirSync(dir).map((f) => f.replace(/\.svg$/, ''))
    expect(files.sort()).toEqual(Object.keys(BRAND_ICONS).sort())
  })
})
