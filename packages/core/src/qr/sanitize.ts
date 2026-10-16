/**
 * Coerces an untrusted design (from a browser request or stored JSON) into a valid Design:
 * unknown keys dropped, enums and colours checked, numbers clamped, logos limited to small
 * data URLs. Anything invalid falls back to the default.
 */
import { isHexColor, normalizeHex } from '../color'
import {
  DEFAULT_DESIGN,
  DOT_STYLES,
  ECC_LEVELS,
  EYE_BALL_STYLES,
  EYE_FRAME_STYLES,
  FRAME_STYLES,
  LOGO_SIZE_MAX,
  LOGO_SIZE_MIN,
  type Design,
  type Fill,
} from './design'

export const MAX_LOGO_DATA_URL = 1_000_000
const LOGO_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback
const color = (v: unknown, fallback: string) =>
  typeof v === 'string' && isHexColor(v) ? normalizeHex(v) : fallback
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

function fill(v: unknown): Fill {
  const f = obj(v)
  if (f.type === 'linear')
    return {
      type: 'linear',
      from: color(f.from, '#000000'),
      to: color(f.to, '#000000'),
      angle: num(f.angle, 0, 360, 45),
    }
  if (f.type === 'radial')
    return { type: 'radial', from: color(f.from, '#000000'), to: color(f.to, '#000000') }
  return { type: 'solid', color: color(f.color, '#000000') }
}

export function sanitizeDesign(input: unknown): Design {
  const d = obj(input)
  const fr = obj(d.frame)
  const lg = obj(d.logo)
  const logo =
    typeof lg.src === 'string' && lg.src.length <= MAX_LOGO_DATA_URL && LOGO_RE.test(lg.src)
      ? { src: lg.src, width: num(lg.width, 1, 4096, 512), height: num(lg.height, 1, 4096, 512) }
      : null
  return {
    dotStyle: oneOf(d.dotStyle, DOT_STYLES, DEFAULT_DESIGN.dotStyle),
    eyeFrameStyle: oneOf(d.eyeFrameStyle, EYE_FRAME_STYLES, DEFAULT_DESIGN.eyeFrameStyle),
    eyeBallStyle: oneOf(d.eyeBallStyle, EYE_BALL_STYLES, DEFAULT_DESIGN.eyeBallStyle),
    foreground: fill(d.foreground),
    eyeFrameColor:
      d.eyeFrameColor === null || d.eyeFrameColor === undefined
        ? null
        : color(d.eyeFrameColor, '#000000'),
    eyeBallColor:
      d.eyeBallColor === null || d.eyeBallColor === undefined
        ? null
        : color(d.eyeBallColor, '#000000'),
    background: color(d.background, DEFAULT_DESIGN.background),
    transparentBackground: d.transparentBackground === true,
    logo,
    // Designs saved before automatic logos existed keep exactly the logo they had.
    logoAuto: d.logoAuto === true,
    logoSize: num(d.logoSize, LOGO_SIZE_MIN, LOGO_SIZE_MAX, DEFAULT_DESIGN.logoSize),
    logoMargin: num(d.logoMargin, 0, 3, DEFAULT_DESIGN.logoMargin),
    clearBehindLogo: d.clearBehindLogo !== false,
    frame: {
      style: oneOf(fr.style, FRAME_STYLES, 'none'),
      text: typeof fr.text === 'string' ? fr.text.slice(0, 32) : DEFAULT_DESIGN.frame.text,
      color: color(fr.color, DEFAULT_DESIGN.frame.color),
      textColor: color(fr.textColor, DEFAULT_DESIGN.frame.textColor),
    },
    ecc: d.ecc === 'auto' ? 'auto' : oneOf(d.ecc, ECC_LEVELS, 'M'),
    quietZone: Math.round(num(d.quietZone, 0, 10, DEFAULT_DESIGN.quietZone)),
  }
}
