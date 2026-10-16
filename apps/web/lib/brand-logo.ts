'use client'

import { brandFor, type BrandIcon, type Logo } from '@qrfinity/core'
import { useEffect } from 'react'
import { useGenerator, useGeneratorStore } from './generator-context'

const SIDE = 512
const cache = new Map<BrandIcon, Promise<Logo>>()

/** A platform icon from /brand-icons, drawn as a PNG data URL like an uploaded logo. */
export function loadBrandLogo(brand: BrandIcon): Promise<Logo> {
  let logo = cache.get(brand)
  if (!logo) {
    logo = (async () => {
      const img = new Image()
      img.src = `/brand-icons/${brand}.svg`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = SIDE
      canvas.height = SIDE
      canvas.getContext('2d')!.drawImage(img, 0, 0, SIDE, SIDE)
      return { src: canvas.toDataURL('image/png'), width: SIDE, height: SIDE }
    })()
    // A failed load (offline) can be retried later.
    logo.catch(() => cache.delete(brand))
    cache.set(brand, logo)
  }
  return logo
}

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
        if (cancelled || !s.design.logoAuto || s.design.logo?.src === logo.src) return
        s.setDesign({ logo })
      })
      .catch((e) => console.warn('The platform icon could not be loaded.', e))
    return () => {
      cancelled = true
    }
  }, [auto, brand, store])
}
