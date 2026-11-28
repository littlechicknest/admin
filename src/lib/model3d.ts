// 3D previews: .glb files the owner uploads. products.models = colour -> public link ('' = every colour).

export const MAX_GLB = 50 * 1024 * 1024

/** Why a file can't be used as a 3D model, or null when it is a .glb ("glTF" in its first 4 bytes). */
export function glbProblem(name: string, head: Uint8Array, size: number): string | null {
  if (!/\.glb$/i.test(name)) return 'Please choose a .glb file (a 3D model). Other 3D files like .gltf, .obj or .usdz do not work here.'
  if (String.fromCharCode(...head.slice(0, 4)) !== 'glTF') return 'This file is not a real .glb 3D model. Please export it again as .glb (glTF binary).'
  if (size > MAX_GLB) return 'This 3D file is too big. Please keep it under 50 MB.'
  return null
}

/** A saved link the admin shows: a .glb in our 3D storage. */
export const isModelLink = (u: unknown): u is string => {
  if (typeof u !== 'string') return false
  try {
    const url = new URL(u)
    return url.protocol === 'https:' && /^\/storage\/v1\/object\/public\/product-models\/.+\.glb$/i.test(url.pathname)
  } catch { return false }
}
