// Gelato's 3D preview: an <iframe> whose link holds the product code and a design picture that Gelato deletes after a day.

const HOST = /(^|\.)gelato\.tech$/i

export type Model3d = { link: URL; image: string; uid: string }

/** Reads the iframe code (or just its link) copied from Gelato. Null when it isn't a Gelato 3D preview. */
export function parse3d(code: string): Model3d | null {
  const raw = code.match(/src\s*=\s*["']([^"']+)["']/i)?.[1] ?? code.trim()
  const text = raw.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  let link: URL
  try { link = new URL(text) } catch { return null }
  const image = link.searchParams.get('image_url') ?? ''
  const uid = link.searchParams.get('product_uid') ?? ''
  if (link.protocol !== 'https:' || !HOST.test(link.hostname) || !/^https:\/\//i.test(image) || !uid) return null
  return { link, image, uid }
}

/** The same preview, with the design picture we keep for good. */
export function withImage(m: Model3d, image: string) {
  const link = new URL(m.link)
  link.searchParams.set('image_url', image)
  return link.toString()
}

/** A saved link the shop may show in a frame. */
export const isModelLink = (u: unknown): u is string => typeof u === 'string' && parse3d(u) !== null
