import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_PAGES, GUIDES, USE_CASES, findPage } from '@/content/registry'

describe('content registry', () => {
  it('keeps titles ≤ 60 and descriptions ≤ 155 characters, all unique', () => {
    for (const p of ALL_PAGES) {
      expect(
        p.title.length,
        `${p.path} title: "${p.title}" (${p.title.length})`,
      ).toBeLessThanOrEqual(60)
      expect(
        p.description.length,
        `${p.path} description (${p.description.length})`,
      ).toBeLessThanOrEqual(155)
      expect(p.description.length, `${p.path} description too short`).toBeGreaterThanOrEqual(90)
    }
    expect(new Set(ALL_PAGES.map((p) => p.title)).size).toBe(ALL_PAGES.length)
    expect(new Set(ALL_PAGES.map((p) => p.description)).size).toBe(ALL_PAGES.length)
    expect(new Set(ALL_PAGES.map((p) => p.h1)).size).toBe(ALL_PAGES.length)
    expect(new Set(ALL_PAGES.map((p) => p.path)).size).toBe(ALL_PAGES.length)
  })

  it('links every use case to 3 related use cases and 2 guides that exist', () => {
    for (const p of USE_CASES) {
      expect(p.related, p.path).toHaveLength(3)
      expect(p.guides, p.path).toHaveLength(2)
      for (const r of [...p.related!, ...p.guides!])
        expect(findPage(r), `${p.path} → ${r}`).toBeDefined()
      expect(p.related).not.toContain(p.path)
    }
    for (const g of GUIDES)
      for (const r of g.related ?? []) expect(findPage(r), `${g.path} → ${r}`).toBeDefined()
  })

  it('every use case is linked from at least one other use case', () => {
    for (const p of USE_CASES.filter((u) => !u.path.endsWith('/bulk'))) {
      expect(
        USE_CASES.some((o) => o.related?.includes(p.path)),
        p.path,
      ).toBe(true)
    }
  })

  it('has an MDX body for every page that uses the shared template', () => {
    const dir = {
      'use-case': 'use-cases',
      guide: 'guides',
      alternative: 'alternatives',
      landing: 'landings',
      tool: 'tools',
    } as const
    for (const p of ALL_PAGES) {
      if (!(p.kind in dir)) continue
      const file = path.join(
        __dirname,
        '../content',
        dir[p.kind as keyof typeof dir],
        `${p.path.split('/').pop()}.mdx`,
      )
      expect(existsSync(file), file).toBe(true)
    }
  })
})
