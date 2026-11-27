import { describe, expect, it } from 'vitest'
import { needsWebp, swap } from './links'
import { fromPrice } from './shop'

const S = 'https://x.supabase.co/storage/v1/object/public/product-images/'

describe('picture optimiser', () => {
  it('only picks our own JPG/PNG pictures', () => {
    expect(needsWebp(`${S}gelato/a.jpg`)).toBe(true)
    expect(needsWebp(`${S}gelato/a.PNG`)).toBe(true)
    expect(needsWebp(`${S}mockups/a.webp`)).toBe(false)
    expect(needsWebp('https://elsewhere.com/a.jpg')).toBe(false)
    expect(needsWebp('products/cap.webp')).toBe(false)
  })
  it('swaps links everywhere, keeps everything else', () => {
    const map = new Map([[`${S}gelato/a.jpg`, `${S}gelato/b.webp`]])
    const row = { gelato_images: { id1: `${S}gelato/a.jpg` }, gelato_photos: [{ url: `${S}gelato/a.jpg`, color: 'Red', option: null }], photo_order: [`${S}gelato/a.jpg`, 'x'] }
    expect(swap(row, map)).toEqual({ gelato_images: { id1: `${S}gelato/b.webp` }, gelato_photos: [{ url: `${S}gelato/b.webp`, color: 'Red', option: null }], photo_order: [`${S}gelato/b.webp`, 'x'] })
  })
})

describe('fromPrice', () => {
  it('uses Gelato retail prices, cost + margin when missing, own price for own products', () => {
    expect(fromPrice({ source: 'gelato', manual_price: null, base_price: 10, skus: [{ cost: 10, price: 30 }, { cost: 12 }] }, 50)).toBe(18)
    expect(fromPrice({ source: 'gelato', manual_price: null, base_price: 10, skus: [{ cost: 10, price: 25 }] }, 50)).toBe(25)
    expect(fromPrice({ source: 'manual', manual_price: 19.5, base_price: null, skus: [] }, 50)).toBe(19.5)
  })
})
