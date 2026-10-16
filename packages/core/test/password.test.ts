import { describe, expect, it } from 'vitest'
import { checkPassword, hashPassword, isPasswordHash, verifyPassword } from '../src/links/password'

describe('password protection hashing', () => {
  it('hashes with a random salt and verifies only the right password', async () => {
    const a = await hashPassword('staff only')
    const b = await hashPassword('staff only')
    expect(isPasswordHash(a)).toBe(true)
    expect(a).not.toBe(b)
    expect(a).not.toContain('staff')
    expect(await verifyPassword('staff only', a)).toBe(true)
    expect(await verifyPassword('staff only ', a)).toBe(false)
    expect(await verifyPassword('Staff only', a)).toBe(false)
    expect(await verifyPassword('', a)).toBe(false)
  })

  it('rejects malformed hashes and oversized input', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('x'.repeat(65), await hashPassword('x'.repeat(64)))).toBe(false)
    expect(isPasswordHash('pbkdf2-sha256$10000$abc$def')).toBe(false)
  })

  it('checks length', () => {
    expect(checkPassword('abc')).toEqual({ ok: false, error: 'Use at least 4 characters.' })
    expect(checkPassword('a'.repeat(65))).toMatchObject({ ok: false })
    expect(checkPassword(' pin ')).toEqual({ ok: true, password: ' pin ' })
    expect(checkPassword(1234)).toMatchObject({ ok: false })
  })
})
