/**
 * Design checks that complement the in-browser decode. A clean digital image decodes
 * more easily than a printed one under café lighting, so these rules flag designs that
 * decode on screen but are likely to fail in the real world.
 */
import { contrastRatio, luminance } from '../color'
import { fillColors, type Design } from '../qr/design'
import type { SceneInfo } from '../qr/scene'

export type CheckIssue = {
  id:
    | 'low-contrast'
    | 'weak-contrast'
    | 'inverted'
    | 'transparent'
    | 'logo-large'
    | 'quiet-zone'
    | 'dense'
    | 'too-small'
  /** One plain sentence: the cause and the fix. `strong` is the fix, shown in bold. */
  message: string
  strong?: string
}

export type CheckResult = {
  /** Issues that make the code fail regardless of the decode. */
  blockers: CheckIssue[]
  warnings: CheckIssue[]
  minPrintMm: number
}

/** Smallest module that phone cameras read reliably at arm's length, in mm. */
export const MIN_MODULE_MM = 0.4
export const MIN_PRINT_MM = 20

export function minPrintSizeMm(info: Pick<SceneInfo, 'sizeWithQuietZone'>): number {
  return Math.max(MIN_PRINT_MM, Math.ceil(info.sizeWithQuietZone * MIN_MODULE_MM))
}

export function formatPrintSize(mm: number): string {
  const cm = mm / 10
  const inches = mm / 25.4
  return `${cm.toFixed(cm < 10 ? 1 : 0)} cm (${inches.toFixed(1)} in)`
}

export function checkDesign(design: Design, info: SceneInfo, printWidthMm?: number): CheckResult {
  const blockers: CheckIssue[] = []
  const warnings: CheckIssue[] = []
  const background = design.transparentBackground ? '#ffffff' : design.background

  const darkColors = [
    ...fillColors(design.foreground),
    ...(design.eyeFrameColor ? [design.eyeFrameColor] : []),
    ...(design.eyeBallColor ? [design.eyeBallColor] : []),
  ]
  const worst = Math.min(...darkColors.map((c) => contrastRatio(c, background)))
  if (worst < 3) {
    blockers.push({
      id: 'low-contrast',
      message: 'The code and background colours are too close for a camera to tell apart.',
      strong: 'Use a darker code colour or a lighter background.',
    })
  } else if (worst < 4.5) {
    warnings.push({
      id: 'weak-contrast',
      message:
        'The colours have only moderate contrast, so the code may be slow to scan in dim light.',
      strong: 'More contrast scans faster.',
    })
  }

  const fgLum = Math.max(...darkColors.map(luminance))
  if (!design.transparentBackground && fgLum > luminance(design.background)) {
    warnings.push({
      id: 'inverted',
      message:
        'This is a light code on a dark background. Newer phones read it; some older phones and scanner apps don’t.',
      strong: 'Use a dark code on a light background to reach everyone.',
    })
  }

  if (design.transparentBackground) {
    warnings.push({
      id: 'transparent',
      message: 'The background is transparent, so the code relies on what it’s printed on.',
      strong: 'Print it on a plain, light surface.',
    })
  }

  if (design.logo && info.logoCoverage > 0.15) {
    warnings.push({
      id: 'logo-large',
      message: `The logo hides ${Math.round(info.logoCoverage * 100)}% of the code.`,
      strong: 'A smaller logo scans more reliably.',
    })
  }

  if (design.quietZone < 2 && (design.frame.style === 'none' || design.transparentBackground)) {
    warnings.push({
      id: 'quiet-zone',
      message: 'There’s little margin around the code, so busy surroundings can confuse cameras.',
      strong: 'Keep a margin of at least 2.',
    })
  }

  if (info.version >= 10) {
    warnings.push({
      id: 'dense',
      message: 'This code holds a lot of data, so its squares are small.',
      strong: 'Shorten the content, or print it larger.',
    })
  }

  const minPrintMm = minPrintSizeMm(info)
  if (printWidthMm !== undefined && printWidthMm < minPrintMm) {
    warnings.push({
      id: 'too-small',
      message: `At ${formatPrintSize(printWidthMm)} wide, the squares are too small to scan reliably.`,
      strong: `Print it at least ${formatPrintSize(minPrintMm)} wide.`,
    })
  }

  return { blockers, warnings, minPrintMm }
}
