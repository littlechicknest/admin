import { describe, expect, it } from 'vitest'
import { parse3d, withImage } from './model3d'

const code = '<iframe class src="https://preflight.internal.ie.live.gelato.tech/product/preview?type=ar-viewer&amp;product_uid=mug_product_msz_11-oz_mmat_ceramic-white_cl_4-0&amp;image_url=https%3A%2F%2Fgelato-api-tmp-live.s3.amazonaws.com%2Fx.png%3FX-Amz-Expires%3D86400" title="preview"></iframe>'

describe('Gelato 3D code', () => {
  it('reads the iframe code and its link', () => {
    for (const c of [code, code.match(/src="([^"]+)"/)![1]]) {
      const m = parse3d(c)!
      expect(m.uid).toBe('mug_product_msz_11-oz_mmat_ceramic-white_cl_4-0')
      expect(m.image).toBe('https://gelato-api-tmp-live.s3.amazonaws.com/x.png?X-Amz-Expires=86400')
    }
  })
  it('swaps in our own picture', () => {
    const out = new URL(withImage(parse3d(code)!, 'https://a.supabase.co/x.png'))
    expect(out.searchParams.get('image_url')).toBe('https://a.supabase.co/x.png')
    expect(out.searchParams.get('type')).toBe('ar-viewer')
  })
  it('refuses anything else', () => {
    expect(parse3d('<iframe src="https://evil.example/product/preview?product_uid=a&image_url=https://x"></iframe>')).toBeNull()
    expect(parse3d('hello')).toBeNull()
    expect(parse3d('http://preflight.gelato.tech/p?product_uid=a&image_url=https://x')).toBeNull()
  })
})
