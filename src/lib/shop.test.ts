import { describe, expect, it } from 'vitest'
import { imgSrc, marginPrice, safeUrl, SHOP_URL } from './shop'

describe('marginPrice', () => {
  it('matches the client examples', () => {
    expect(marginPrice(15, 100)).toBe(30)
    expect(marginPrice(15, 50)).toBe(22.5)
    expect(marginPrice(9.99, 1)).toBe(10.09)
    expect(marginPrice(20.35, 50)).toBe(30.53) // half-cent, must round like Postgres
  })
})

it('only allows web links and files shipped with the shop', () => {
  expect(safeUrl('javascript:alert(1)')).toBeNull()
  expect(imgSrc('products/cap.webp')).toBe(`${SHOP_URL}products/cap.webp`)
  expect([imgSrc('../secret.webp'), imgSrc('//evil.com/a.png')]).toEqual([null, null])
})
