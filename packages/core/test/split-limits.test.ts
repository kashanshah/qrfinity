import { describe, expect, it } from 'vitest'
import {
  limitReached,
  limitSwitch,
  mainPercent,
  parseLinkRecord,
  parseSplit,
  pickVersion,
  validateLimits,
  validateSplit,
  zonedTimeToUtc,
} from '../src/index'

const check = (url: string) =>
  url.includes('bad')
    ? ({ ok: false, message: 'That link is blocked.' } as const)
    : ({ ok: true, url: url.startsWith('http') ? url : `https://${url}` } as const)

describe('split traffic', () => {
  it('validates shares and destinations', () => {
    expect(validateSplit([], check)).toEqual({ ok: true, split: null })
    const r = validateSplit([{ name: ' New menu ', dest: 'b.com', percent: 30 }], check)
    expect(r).toEqual({
      ok: true,
      split: { variants: [{ name: 'New menu', dest: 'https://b.com', percent: 30 }] },
    })
    if (r.ok) expect(mainPercent(r.split!)).toBe(70)
    expect(validateSplit([{ dest: 'b.com', percent: 0 }], check)).toEqual({
      ok: false,
      error: 'Version B: give it a whole-number share of at least 1%.',
    })
    expect(validateSplit([{ dest: 'bad.com', percent: 10 }], check)).toEqual({
      ok: false,
      error: 'Version B: That link is blocked.',
    })
    expect(
      validateSplit(
        [
          { dest: 'b.com', percent: 50 },
          { dest: 'c.com', percent: 50 },
        ],
        check,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('Leave at least 1%') })
    expect(validateSplit(Array(5).fill({ dest: 'b.com', percent: 1 }), check)).toMatchObject({
      ok: false,
      error: 'A code can have up to 5 versions.',
    })
  })

  it('picks versions by share', () => {
    const split = {
      variants: [
        { name: '', dest: 'https://b.com', percent: 20 },
        { name: 'Promo', dest: 'https://c.com', percent: 30 },
      ],
    }
    expect(pickVersion('https://a.com', split, 0.1)).toEqual({
      dest: 'https://b.com',
      label: 'Version B',
    })
    expect(pickVersion('https://a.com', split, 0.25)).toEqual({
      dest: 'https://c.com',
      label: 'Promo',
    })
    expect(pickVersion('https://a.com', split, 0.6)).toEqual({
      dest: 'https://a.com',
      label: 'Version A',
    })
    expect(pickVersion('https://a.com', undefined, 0.1)).toEqual({
      dest: 'https://a.com',
      label: '',
    })
  })

  it('drops malformed splits at the edge', () => {
    expect(parseSplit({ variants: [{ dest: 'javascript:x', percent: 10 }] })).toBeUndefined()
    expect(parseSplit({ variants: [{ dest: 'https://b.com', percent: 100 }] })).toBeUndefined()
    const rec = parseLinkRecord({
      id: 'x',
      owner: 'o',
      dest: 'https://a.com',
      status: 'active',
      v: 1,
      split: { variants: [{ name: '', dest: 'https://b.com', percent: 50 }] },
      limit: { at: '2026-12-31T05:00:00.000Z', dest: 'https://ended.com' },
    })
    expect(rec?.split?.variants).toHaveLength(1)
    expect(rec?.limit).toEqual({ at: '2026-12-31T05:00:00.000Z', dest: 'https://ended.com' })
  })
})

describe('date and scan limits', () => {
  const now = new Date('2026-10-16T12:00:00Z')

  it('converts a local date and time to UTC, across daylight saving', () => {
    expect(zonedTimeToUtc('2026-12-31', '23:00', 'America/Toronto').toISOString()).toBe(
      '2027-01-01T04:00:00.000Z',
    )
    expect(zonedTimeToUtc('2026-07-01', '09:30', 'America/Toronto').toISOString()).toBe(
      '2026-07-01T13:30:00.000Z',
    )
    expect(zonedTimeToUtc('2026-07-01', '09:30', 'UTC').toISOString()).toBe(
      '2026-07-01T09:30:00.000Z',
    )
  })

  it('validates what the owner entered', () => {
    expect(validateLimits({ dest: 'a.com' }, check, { now })).toEqual({
      ok: false,
      error: 'Set a date, a number of scans, or both.',
    })
    expect(validateLimits({ dest: 'a.com', scans: 0 }, check, { now })).toMatchObject({
      ok: false,
    })
    expect(validateLimits({ scans: 10 }, check, { now })).toEqual({
      ok: false,
      error: 'Enter where scans go after the limit.',
    })
    expect(
      validateLimits(
        { dest: 'ended.com', date: '2026-12-31', time: '23:00', timezone: 'America/Toronto' },
        check,
        { now },
      ),
    ).toEqual({
      ok: true,
      limits: {
        dest: 'https://ended.com',
        date: '2026-12-31',
        time: '23:00',
        timezone: 'America/Toronto',
        at: '2027-01-01T04:00:00.000Z',
        since: now.toISOString(),
      },
    })
  })

  it('keeps counting when the scan limit is unchanged', () => {
    const previous = {
      dest: 'https://a.com',
      scans: 100,
      since: '2026-10-01T00:00:00.000Z',
      reachedAt: '2026-10-10T00:00:00.000Z',
    }
    const same = validateLimits({ dest: 'b.com', scans: 100 }, check, { now, previous })
    expect(same).toMatchObject({
      ok: true,
      limits: { since: previous.since, reachedAt: previous.reachedAt },
    })
    const changed = validateLimits({ dest: 'b.com', scans: 200 }, check, { now, previous })
    expect(changed.ok && changed.limits).toEqual({
      dest: 'https://b.com',
      scans: 200,
      since: now.toISOString(),
    })
  })

  it('switches at the earlier of the date and the reached scan limit', () => {
    expect(limitSwitch({ dest: 'https://e.com', scans: 5, since: 'x' })).toBeUndefined()
    const s = limitSwitch({
      dest: 'https://e.com',
      at: '2026-12-31T00:00:00.000Z',
      reachedAt: '2026-11-01T10:00:00.000Z',
    })
    expect(s).toEqual({ at: '2026-11-01T10:00:00.000Z', dest: 'https://e.com' })
    expect(limitReached(s, new Date('2026-11-01T09:59:59Z'))).toBe(false)
    expect(limitReached(s, new Date('2026-11-01T10:00:00Z'))).toBe(true)
  })
})
