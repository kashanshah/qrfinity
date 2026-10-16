import { describe, expect, it } from 'vitest'
import { brandFor, encodeContent, exactContent, identifyAppCode } from '../src'

describe('identifyAppCode', () => {
  it('names WeChat, WeChat Pay and Alipay codes', () => {
    expect(identifyAppCode('https://u.wechat.com/EBUzAbCdE')).toEqual({
      app: 'wechat',
      kind: 'contact',
    })
    expect(identifyAppCode('https://weixin.qq.com/g/AbC123')).toEqual({
      app: 'wechat',
      kind: 'group',
    })
    expect(identifyAppCode('http://weixin.qq.com/r/xyz')).toEqual({
      app: 'wechat',
      kind: 'official-account',
    })
    expect(identifyAppCode('wxp://f2f0AbCdEf')).toEqual({ app: 'wechat-pay' })
    expect(identifyAppCode('https://qr.alipay.com/fkx12345')).toEqual({ app: 'alipay' })
  })
  it('leaves everything else alone', () => {
    expect(identifyAppCode('https://example.com/weixin.qq.com')).toBeNull()
    expect(identifyAppCode('https://notalipay.com/')).toBeNull()
    expect(identifyAppCode('WIFI:S:x;;')).toBeNull()
  })
})

describe('exactContent', () => {
  // Restyling must reproduce the original text exactly, or the app won't read it.
  const roundTrip = (text: string) => {
    const { type, fields } = exactContent(text)
    return encodeContent(type, fields[type]!)
  }
  it.each([
    'https://u.wechat.com/EBUzAbCdE',
    'http://weixin.qq.com/r/xyz',
    'wxp://f2f0AbCdEf',
    'https://qr.alipay.com/fkx12345?t=1',
    'HTTPS://QR.ALIPAY.COM/FKX12345',
    '  padded text  ',
    'WIFI:S:Home;T:WPA;P:secret;;',
  ])('encodes %s back to the same text', (text) => {
    expect(roundTrip(text)).toEqual({ ok: true, payload: text })
  })
  it('gets the WeChat logo for WeChat Pay, the Alipay logo for Alipay', () => {
    const pay = exactContent('wxp://f2f0AbCdEf')
    expect(brandFor(pay.type, pay.fields[pay.type]!)).toBe('wechat')
    const ali = exactContent('https://qr.alipay.com/fkx12345')
    expect(brandFor(ali.type, ali.fields[ali.type]!)).toBe('alipay')
  })
})
