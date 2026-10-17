'use client'

import type { Design } from '@qrfinity/core'
import { createContext, useContext, useEffect } from 'react'
import { contentVariant, track, trackOnce } from './analytics'
import type { GeneratorState, GeneratorStore } from './store'

/** Where a generator sits: the public generator, a saved code's page, or the restyle tool. */
export type GeneratorSurface = 'generator' | 'code_page' | 'restyle'

export const SurfaceContext = createContext<GeneratorSurface>('generator')
export const useGeneratorSurface = () => useContext(SurfaceContext)

/**
 * Which design option a change touched, and its new value as an option name (never a colour,
 * text or image). Null for changes that aren't a choice (the logo image loading, say).
 */
function designOption<K extends keyof Design>(
  key: K,
  next: Design,
  prev: Design,
): [string, string] | null {
  switch (key) {
    case 'dotStyle':
    case 'eyeFrameStyle':
    case 'eyeBallStyle':
    case 'ecc':
      return [key, String(next[key])]
    case 'foreground':
      return ['foreground', next.foreground.type]
    case 'background':
      return ['background', 'custom']
    case 'eyeFrameColor':
    case 'eyeBallColor':
      return [key, next[key] === null ? 'same' : 'custom']
    case 'transparentBackground':
      return ['transparent', next.transparentBackground ? 'on' : 'off']
    case 'logo':
    case 'logoAuto':
      // The logo following the content (a platform icon) isn't a choice.
      if (next.logoAuto && prev.logoAuto) return null
      return ['logo', !next.logo ? 'none' : next.logoAuto ? 'auto' : 'custom']
    case 'logoSize':
    case 'logoMargin':
    case 'quietZone':
      return [key, 'changed']
    case 'clearBehindLogo':
      return [key, next.clearBehindLogo ? 'on' : 'off']
    case 'frame':
      return next.frame.style !== prev.frame.style
        ? ['frame', next.frame.style]
        : next.frame.text !== prev.frame.text
          ? ['frame_text', 'changed']
          : ['frame_color', 'custom']
    default:
      return null
  }
}

/**
 * Turns generator changes into events: the first edit, kind and type choices, and each design
 * option tried (once per page load per value, so dragging a slider is one event).
 */
export function useGeneratorTracking(store: GeneratorStore, surface: GeneratorSurface) {
  useEffect(
    () =>
      store.subscribe((s: GeneratorState, prev: GeneratorState) => {
        if (s.kind !== prev.kind) track('code_kind_selected', { kind: s.kind })
        if (s.type !== prev.type)
          track('content_type_selected', {
            content_type: s.type,
            kind: s.kind,
            previous: prev.type,
          })
        if (s.fields !== prev.fields) {
          trackOnce('generator_started', 'generator_started', {
            content_type: s.type,
            kind: s.kind,
          })
          const variant = contentVariant(s.type, s.fields[s.type])
          if (variant !== contentVariant(s.type, prev.fields[s.type]))
            trackOnce(`variant:${s.type}:${variant}`, 'content_variant_selected', {
              content_type: s.type,
              variant,
            })
        }
        if (s.printWidthMm !== prev.printWidthMm)
          trackOnce('design:print_width', 'design_option_used', {
            option: 'print_width',
            value: 'changed',
          })
        if (s.design !== prev.design) {
          const changed = (Object.keys(s.design) as (keyof Design)[]).filter(
            (k) => s.design[k] !== prev.design[k],
          )
          // Many keys at once is a saved design applied or a reset, not a choice.
          if (changed.length > 3) return
          for (const key of changed) {
            const o = designOption(key, s.design, prev.design)
            if (o)
              trackOnce(`design:${surface}:${o[0]}:${o[1]}`, 'design_option_used', {
                option: o[0],
                value: o[1],
              })
          }
        }
      }),
    [store, surface],
  )
}

/**
 * Problems people get stuck on: reported once they've lasted a few seconds (so typing through
 * a half-written address isn't counted), and once per page load per reason.
 */
export function useStuckProblem(
  problem: string | null,
  onStuck: (problem: string) => void,
  ms = 4000,
) {
  useEffect(() => {
    if (!problem) return
    const t = setTimeout(() => onStuck(problem), ms)
    return () => clearTimeout(t)
    // onStuck is recreated each render; the problem is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem, ms])
}
