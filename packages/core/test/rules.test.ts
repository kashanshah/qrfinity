import { describe, expect, it } from 'vitest'
import { parseLinkRecord } from '../src/links/record'
import {
  describeCondition,
  localTime,
  pickDestination,
  validateRules,
  type RedirectRule,
} from '../src/links/rules'

const ok = (url: string) =>
  url.startsWith('bad') ? { ok: false as const, message: 'Bad link.' } : { ok: true as const, url }

// 2026-10-16 is a Friday. 16:30 UTC is 12:30 in Toronto (UTC-4 in October).
const fridayLunch = new Date('2026-10-16T16:30:00Z')
const facts = (over: Partial<{ os: string; country: string; now: Date }> = {}) => ({
  os: 'Other',
  country: 'CA',
  now: fridayLunch,
  ...over,
})

describe('redirect rules', () => {
  it('validates, cleans and keeps the order', () => {
    const r = validateRules(
      [
        {
          name: '  App  ',
          when: { type: 'device', devices: ['android', 'ios', 'ios'] },
          dest: 'a',
        },
        { when: { type: 'country', countries: ['US', 'CA', 'US'] }, dest: 'b' },
      ],
      ok,
    )
    expect(r).toEqual({
      ok: true,
      rules: [
        { name: 'App', when: { type: 'device', devices: ['ios', 'android'] }, dest: 'a' },
        { name: '', when: { type: 'country', countries: ['CA', 'US'] }, dest: 'b' },
      ],
    })
  })

  it('explains what is wrong, naming the rule', () => {
    const bad = (when: unknown, dest = 'x') => validateRules([{ when, dest }], ok)
    expect(bad({ type: 'device', devices: [] })).toEqual({
      ok: false,
      error: 'Rule 1: Choose at least one kind of phone.',
    })
    expect(bad({ type: 'country', countries: ['Canada'] })).toMatchObject({ ok: false })
    expect(
      bad({ type: 'schedule', timezone: 'Mars/Base', days: [1], from: '09:00', to: '17:00' }),
    ).toMatchObject({ error: 'Rule 1: Choose a time zone.' })
    expect(
      bad({ type: 'schedule', timezone: 'UTC', days: [1], from: '09:00', to: '09:00' }),
    ).toMatchObject({ ok: false })
    expect(
      bad({ type: 'dates', timezone: 'UTC', start: '2026-12-05', end: '2026-12-01' }),
    ).toMatchObject({ error: 'Rule 1: The end date is before the start date.' })
    expect(bad({ type: 'device', devices: ['ios'] }, 'bad.example')).toEqual({
      ok: false,
      error: 'Rule 1: Bad link.',
    })
    expect(validateRules(Array(11).fill({}), ok)).toMatchObject({ ok: false })
  })

  it('picks the first matching rule, else the main destination', () => {
    const rules: RedirectRule[] = [
      { name: '', when: { type: 'device', devices: ['ios'] }, dest: 'https://apps.apple.com' },
      { name: 'Play', when: { type: 'device', devices: ['android'] }, dest: 'https://play' },
      { name: '', when: { type: 'country', countries: ['FR'] }, dest: 'https://fr' },
    ]
    expect(pickDestination('https://main', rules, facts({ os: 'iOS' }))).toEqual({
      dest: 'https://apps.apple.com',
      rule: 'iPhone and iPad',
    })
    expect(pickDestination('https://main', rules, facts({ os: 'Android', country: 'FR' }))).toEqual(
      { dest: 'https://play', rule: 'Play' },
    )
    expect(pickDestination('https://main', rules, facts({ country: 'fr' })).dest).toBe('https://fr')
    expect(pickDestination('https://main', rules, facts())).toEqual({
      dest: 'https://main',
      rule: '',
    })
    expect(pickDestination('https://main', undefined, facts()).dest).toBe('https://main')
  })

  it('reads the clock in the owner’s time zone', () => {
    expect(localTime(fridayLunch, 'America/Toronto')).toEqual({
      day: 5,
      time: '12:30',
      date: '2026-10-16',
    })
    expect(localTime(fridayLunch, 'Asia/Tokyo')).toEqual({
      day: 6,
      time: '01:30',
      date: '2026-10-17',
    })
    const lunch: RedirectRule = {
      name: '',
      when: {
        type: 'schedule',
        timezone: 'America/Toronto',
        days: [1, 2, 3, 4, 5],
        from: '11:00',
        to: '15:00',
      },
      dest: 'https://lunch',
    }
    expect(pickDestination('m', [lunch], facts()).dest).toBe('https://lunch')
    expect(
      pickDestination('m', [lunch], facts({ now: new Date('2026-10-16T20:00:00Z') })).dest,
    ).toBe('m')
    // Saturday lunch isn't a weekday.
    expect(
      pickDestination('m', [lunch], facts({ now: new Date('2026-10-17T16:30:00Z') })).dest,
    ).toBe('m')
  })

  it('handles windows that cross midnight', () => {
    const late: RedirectRule = {
      name: '',
      when: { type: 'schedule', timezone: 'UTC', days: [5], from: '22:00', to: '02:00' },
      dest: 'https://late',
    }
    const at = (iso: string) => pickDestination('m', [late], facts({ now: new Date(iso) })).dest
    expect(at('2026-10-16T23:00:00Z')).toBe('https://late') // Friday 23:00
    expect(at('2026-10-17T01:30:00Z')).toBe('https://late') // Saturday 01:30, Friday's night
    expect(at('2026-10-17T02:00:00Z')).toBe('m')
    expect(at('2026-10-17T23:00:00Z')).toBe('m') // Saturday night isn't listed
  })

  it('matches date ranges including both ends', () => {
    const event: RedirectRule = {
      name: 'Event',
      when: {
        type: 'dates',
        timezone: 'America/Vancouver',
        start: '2026-10-16',
        end: '2026-10-18',
      },
      dest: 'https://event',
    }
    const at = (iso: string) => pickDestination('m', [event], facts({ now: new Date(iso) })).dest
    expect(at('2026-10-16T07:30:00Z')).toBe('https://event') // 00:30 on the 16th in Vancouver
    expect(at('2026-10-16T06:30:00Z')).toBe('m') // still the 15th there
    expect(at('2026-10-19T06:59:00Z')).toBe('https://event') // 23:59 on the 18th
  })

  it('describes rules in plain words', () => {
    expect(describeCondition({ type: 'device', devices: ['ios', 'android'] })).toBe(
      'iPhone and iPad, Android',
    )
    expect(describeCondition({ type: 'country', countries: ['CA', 'FR', 'GB', 'US', 'DE'] })).toBe(
      'CA, FR, GB and 2 more',
    )
    expect(
      describeCondition({
        type: 'schedule',
        timezone: 'UTC',
        days: [0, 6],
        from: '10:00',
        to: '14:00',
      }),
    ).toBe('Weekends 10:00–14:00')
    expect(
      describeCondition({ type: 'dates', timezone: 'UTC', start: '2026-12-24', end: '2026-12-24' }),
    ).toBe('2026-12-24')
  })

  it('reads rules from an edge record, dropping malformed ones', () => {
    const record = parseLinkRecord({
      id: 'c',
      owner: 'o',
      dest: 'https://main',
      status: 'active',
      v: 3,
      rules: [
        { name: '', when: { type: 'device', devices: ['ios'] }, dest: 'https://ios' },
        { name: '', when: { type: 'nope' }, dest: 'https://x' },
        { name: '', when: { type: 'device', devices: ['ios'] }, dest: 'javascript:alert(1)' },
      ],
    })
    expect(record?.rules).toEqual([
      { name: '', when: { type: 'device', devices: ['ios'] }, dest: 'https://ios' },
    ])
    expect(
      parseLinkRecord({ id: 'c', owner: 'o', dest: 'https://m', status: 'active', v: 1 }),
    ).not.toHaveProperty('rules')
  })
})
