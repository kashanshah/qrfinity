/** The design model shared by the generator UI, the renderers and the scan checks. */

export const DOT_STYLES = ['square', 'rounded', 'fluid', 'dots', 'diamond'] as const
export const EYE_FRAME_STYLES = ['square', 'rounded', 'circle', 'leaf'] as const
export const EYE_BALL_STYLES = ['square', 'rounded', 'circle', 'leaf'] as const
export const FRAME_STYLES = ['none', 'box-bottom', 'box-top', 'pill-bottom'] as const
export const ECC_LEVELS = ['L', 'M', 'Q', 'H'] as const

export type DotStyle = (typeof DOT_STYLES)[number]
export type EyeFrameStyle = (typeof EYE_FRAME_STYLES)[number]
export type EyeBallStyle = (typeof EYE_BALL_STYLES)[number]
export type FrameStyle = (typeof FRAME_STYLES)[number]
export type EccLevel = (typeof ECC_LEVELS)[number]

export type Fill =
  | { type: 'solid'; color: string }
  /** `angle` in degrees: 0 runs left → right, 90 top → bottom. */
  | { type: 'linear'; from: string; to: string; angle: number }
  /** `from` at the centre, `to` at the corners. */
  | { type: 'radial'; from: string; to: string }

/** An uploaded logo. */
export type ImageLogo = {
  type?: 'image'
  /** A data: URL (PNG or JPEG). Logos are processed in the browser and never uploaded. */
  src: string
  width: number
  height: number
}

/**
 * A logo drawn as shapes (the platform icons), so every format keeps it sharp. Paths use only
 * absolute M, L, C and Z commands, in a `width` × `height` box with its corner at 0,0.
 */
export type VectorLogo = {
  type: 'vector'
  width: number
  height: number
  paths: { d: string; fill: string }[]
}

export type Logo = ImageLogo | VectorLogo

export const isVectorLogo = (logo: Logo | null): logo is VectorLogo => logo?.type === 'vector'

export type Design = {
  dotStyle: DotStyle
  eyeFrameStyle: EyeFrameStyle
  eyeBallStyle: EyeBallStyle
  foreground: Fill
  /** null = same as the foreground. */
  eyeFrameColor: string | null
  eyeBallColor: string | null
  background: string
  transparentBackground: boolean
  logo: Logo | null
  /**
   * The logo follows the content: the platform's icon for WhatsApp, social profiles, app stores
   * and other known links, none otherwise. Picking "None" or uploading a logo turns it off.
   */
  logoAuto: boolean
  /** Logo box as a fraction of the code's width (0.1–0.3). */
  logoSize: number
  /** Clear space around the logo, in modules. */
  logoMargin: number
  /** Remove the modules behind the logo so it sits on a clean background. */
  clearBehindLogo: boolean
  frame: { style: FrameStyle; text: string; color: string; textColor: string }
  ecc: 'auto' | EccLevel
  /** Quiet zone (margin) in modules. The QR standard asks for 4. */
  quietZone: number
}

export const DEFAULT_DESIGN: Design = {
  dotStyle: 'square',
  eyeFrameStyle: 'square',
  eyeBallStyle: 'square',
  foreground: { type: 'solid', color: '#000000' },
  eyeFrameColor: null,
  eyeBallColor: null,
  background: '#ffffff',
  transparentBackground: false,
  logo: null,
  logoAuto: true,
  logoSize: 0.22,
  logoMargin: 1,
  clearBehindLogo: true,
  frame: { style: 'none', text: 'Scan me', color: '#000000', textColor: '#ffffff' },
  ecc: 'auto',
  quietZone: 4,
}

export const LOGO_SIZE_MIN = 0.1
export const LOGO_SIZE_MAX = 0.3

/** Error correction actually used: a logo always raises it to H. */
export function effectiveEcc(design: Pick<Design, 'ecc' | 'logo'>): EccLevel {
  if (design.logo) return 'H'
  return design.ecc === 'auto' ? 'M' : design.ecc
}

/** The colours a fill uses, for contrast checks. */
export function fillColors(fill: Fill): string[] {
  return fill.type === 'solid' ? [fill.color] : [fill.from, fill.to]
}
