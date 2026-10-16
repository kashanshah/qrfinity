import { describe, expect, it } from 'vitest'
import {
  brandFor,
  canBeDynamic,
  crc16,
  DEFAULT_PAYMENT,
  encodeContent,
  parseContent,
  type PaymentFields,
} from '../src'

const pay = (patch: Partial<PaymentFields>) =>
  encodeContent('payment', { ...DEFAULT_PAYMENT, ...patch })
const payload = (patch: Partial<PaymentFields>) => {
  const r = pay(patch)
  if (!r.ok) throw new Error(JSON.stringify(r))
  return r.payload
}

// The example static BR Code in Banco Central do Brasil's Pix manual (Manual de Padrões para
// Iniciação do Pix, appendix: "Exemplo de BR Code estático").
const BCB_EXAMPLE =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D'

describe('Pix', () => {
  it('matches the central bank’s example exactly', () => {
    expect(
      payload({
        method: 'pix',
        account: '123e4567-e12b-12d1-a456-426655440000',
        name: 'Fulano de Tal',
        city: 'BRASILIA',
      }),
    ).toBe(BCB_EXAMPLE)
  })

  it('computes CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1')
  })

  it('adds the amount and note, strips accents and normalises keys', () => {
    const code = payload({
      method: 'pix',
      account: '123.456.789-09',
      name: 'José Açaí',
      city: 'São Paulo',
      amount: '12,5',
      note: 'Mesa 4',
    })
    expect(code).toContain('0111123456789090206Mesa 4')
    expect(code).toContain('540512.50')
    expect(code).toContain('5909Jose Acai6009Sao Paulo')
    expect(code.slice(-8, -4)).toBe('6304')
    expect(crc16(code.slice(0, -4))).toBe(code.slice(-4))
  })

  it('reads +55 numbers as phone keys and 11 bare digits as a CPF', () => {
    expect(
      payload({ method: 'pix', account: '+55 11 91234-5678', name: 'A', city: 'B' }),
    ).toContain('0114+5511912345678')
    expect(payload({ method: 'pix', account: '11912345678', name: 'A', city: 'B' })).toContain(
      '011111912345678',
    )
    expect(pay({ method: 'pix', account: '+1 415 555 0100', name: 'A', city: 'B' })).toMatchObject({
      ok: false,
    })
  })

  it('needs a name and a city', () => {
    expect(pay({ method: 'pix', account: 'a@b.co' })).toMatchObject({
      errors: { name: expect.any(String) },
    })
    expect(pay({ method: 'pix', account: 'a@b.co', name: 'A' })).toMatchObject({
      errors: { city: expect.any(String) },
    })
  })

  it('reads its own codes back', () => {
    expect(parseContent(BCB_EXAMPLE)).toMatchObject({
      type: 'payment',
      fields: { method: 'pix', name: 'Fulano de Tal', city: 'BRASILIA' },
    })
  })

  it('leaves codes it can’t re-make exactly as text', () => {
    const withTxid = BCB_EXAMPLE.replace('0503***', '0503ABC')
    expect(parseContent(withTxid).type).toBe('text')
  })
})

describe('UPI', () => {
  it('builds a upi://pay link', () => {
    expect(
      payload({
        method: 'upi',
        account: 'chai.stall@okaxis',
        name: 'Ravi’s Chai',
        amount: '20',
        note: 'Tea',
      }),
    ).toBe('upi://pay?pa=chai.stall@okaxis&pn=Ravi%E2%80%99s%20Chai&am=20.00&cu=INR&tn=Tea')
  })

  it('checks the UPI ID and name', () => {
    expect(pay({ method: 'upi', account: 'not-an-id', name: 'A' })).toMatchObject({
      errors: { account: expect.any(String) },
    })
    expect(pay({ method: 'upi', account: 'ab@ybl' })).toMatchObject({
      errors: { name: expect.any(String) },
    })
  })

  it('round-trips', () => {
    const code = payload({ method: 'upi', account: 'a.b@ybl', name: 'Asha Rao', amount: '150' })
    expect(parseContent(code)).toMatchObject({
      type: 'payment',
      fields: { method: 'upi', account: 'a.b@ybl' },
    })
  })
})

describe('payment links', () => {
  it('makes PayPal.Me, Venmo and Cash App links', () => {
    expect(payload({ method: 'paypal', account: 'JaneDoe', amount: '10' })).toBe(
      'https://paypal.me/JaneDoe/10.00',
    )
    expect(payload({ method: 'paypal', account: 'https://www.paypal.me/JaneDoe' })).toBe(
      'https://paypal.me/JaneDoe',
    )
    expect(payload({ method: 'venmo', account: '@Jane-Doe-7' })).toBe(
      'https://venmo.com/u/Jane-Doe-7',
    )
    expect(payload({ method: 'venmo', account: 'venmo.com/u/Jane-Doe-7' })).toBe(
      'https://venmo.com/u/Jane-Doe-7',
    )
    expect(payload({ method: 'cashapp', account: '$janedoe', amount: '12.50' })).toBe(
      'https://cash.app/$janedoe/12.5',
    )
    expect(payload({ method: 'cashapp', account: 'https://cash.app/$janedoe' })).toBe(
      'https://cash.app/$janedoe',
    )
  })

  it('rejects other sites and bad amounts', () => {
    expect(pay({ method: 'paypal', account: 'evil.com/JaneDoe' })).toMatchObject({ ok: false })
    expect(pay({ method: 'cashapp', account: 'janedoe', amount: '-3' })).toMatchObject({
      errors: { amount: expect.any(String) },
    })
  })

  it('reads links back as payments', () => {
    expect(parseContent('https://cash.app/$janedoe/12.5')).toMatchObject({
      type: 'payment',
      fields: { method: 'cashapp', account: '$janedoe' },
    })
  })
})

describe('payment codes elsewhere', () => {
  it('can be dynamic only when the code is a link', () => {
    expect(canBeDynamic('payment', { ...DEFAULT_PAYMENT, method: 'cashapp' })).toBe(true)
    expect(canBeDynamic('payment', { ...DEFAULT_PAYMENT, method: 'upi' })).toBe(false)
    expect(canBeDynamic('text')).toBe(false)
  })

  it('gets the method’s icon', () => {
    expect(brandFor('payment', { ...DEFAULT_PAYMENT, method: 'pix' })).toBe('pix')
    expect(brandFor('payment', { ...DEFAULT_PAYMENT, method: 'upi' })).toBe('payment')
  })
})
