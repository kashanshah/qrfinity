'use client'

import { brandFor, type BrandIcon, type Logo, type VectorLogo } from '@qrfinity/core'
import { useEffect } from 'react'
import { useGenerator, useGeneratorStore } from './generator-context'

const cache = new Map<BrandIcon, Promise<VectorLogo>>()

/**
 * A platform icon from /brand-icons as a vector logo: the SVG's paths (absolute M/L/C/Z, made
 * by scripts/build-brand-icons.mjs) and its viewBox size.
 */
export function loadBrandLogo(brand: BrandIcon): Promise<VectorLogo> {
  let logo = cache.get(brand)
  if (!logo) {
    logo = (async () => {
      const res = await fetch(brandIconUrl(brand))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const svg = new DOMParser().parseFromString(await res.text(), 'image/svg+xml').documentElement
      const [, , width = 24, height = 24] = (svg.getAttribute('viewBox') ?? '')
        .split(/\s+/)
        .map(Number)
      const paths = [...svg.querySelectorAll('path')].map((p) => ({
        d: p.getAttribute('d') ?? '',
        fill: p.getAttribute('fill') ?? '#000000',
      }))
      return { type: 'vector' as const, width, height, paths }
    })()
    // A failed load (offline) can be retried later.
    logo.catch(() => cache.delete(brand))
    cache.set(brand, logo)
  }
  return logo
}

export const brandIconUrl = (brand: BrandIcon) => `/brand-icons/${brand}.svg`

const sameLogo = (a: Logo | null, b: Logo) => JSON.stringify(a) === JSON.stringify(b)

/** The platform the generator's current content points to. */
export function useBrand(): BrandIcon | null {
  return useGenerator((s) => brandFor(s.type, s.fields[s.type]))
}

/** While the logo is on "Automatic", keeps it in step with the content. */
export function useAutoLogo() {
  const store = useGeneratorStore()
  const auto = useGenerator((s) => s.design.logoAuto)
  const brand = useBrand()
  useEffect(() => {
    if (!auto) return
    const { design, setDesign } = store.getState()
    if (!brand) {
      if (design.logo) setDesign({ logo: null })
      return
    }
    let cancelled = false
    loadBrandLogo(brand)
      .then((logo) => {
        const s = store.getState()
        if (cancelled || !s.design.logoAuto || sameLogo(s.design.logo, logo)) return
        s.setDesign({ logo })
      })
      .catch((e) => console.warn('The platform icon could not be loaded.', e))
    return () => {
      cancelled = true
    }
  }, [auto, brand, store])
}
