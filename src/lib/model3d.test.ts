import { describe, expect, it } from 'vitest'
import { glbProblem, isModelLink, MAX_GLB } from './model3d'

const glTF = new Uint8Array([0x67, 0x6c, 0x54, 0x46])

describe('3D model files', () => {
  it('takes a real .glb', () => {
    expect(glbProblem('Mug.GLB', glTF, 1000)).toBeNull()
  })
  it('refuses other files, fakes and huge ones', () => {
    expect(glbProblem('mug.gltf', glTF, 1000)).toMatch(/\.glb/)
    expect(glbProblem('mug.glb', new Uint8Array([0x50, 0x4b, 3, 4]), 1000)).toMatch(/not a real/)
    expect(glbProblem('mug.glb', glTF, MAX_GLB + 1)).toMatch(/too big/)
  })
  it('only shows links to our 3D storage', () => {
    expect(isModelLink('https://a.supabase.co/storage/v1/object/public/product-models/1/x.glb')).toBe(true)
    expect(isModelLink('https://a.supabase.co/storage/v1/object/public/product-images/1/x.glb')).toBe(false)
    expect(isModelLink('https://preflight.live.gelato.tech/product/preview?x=1')).toBe(false)
    expect(isModelLink(5)).toBe(false)
  })
})
