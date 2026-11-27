import type { Json, Tables } from './database.types'
import { detect, looksRight, readPics, viewRank, voteColor, type Gender, type Palette, type Photo, type Pic } from './mockups'
import { asVariants } from './shop'
import { supabase } from './supabase'

export type Product = Tables<'products'>
const bucket = () => supabase.storage.from('product-images')

export const asPhotos = (v: Json) => (Array.isArray(v) ? (v as unknown as Photo[]) : [])

export function paletteOf(p: Product): Palette {
  const variants = asVariants(p.variants)
  return {
    colors: variants.map((v) => ({ name: v.color, hex: v.hex })),
    options: variants.some((v) => v.option) ? [...new Set(variants.flatMap((v) => v.sizes))] : [],
    skus: Array.isArray(p.skus) ? (p.skus as unknown as Palette['skus']) : [],
  }
}

const toBlob = (c: HTMLCanvasElement, type: string) => new Promise<Blob | null>((ok) => c.toBlob(ok, type, 0.86))

/** Any picture the browser can open, shrunk and saved as WebP (JPG on browsers that can't write WebP). */
async function shrink(blob: Blob, max: number): Promise<{ blob: Blob; bitmap: ImageBitmap }> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) })
  const g = c.getContext('2d')!
  g.drawImage(bitmap, 0, 0, c.width, c.height)
  let out = await toBlob(c, 'image/webp')
  if (out?.type !== 'image/webp') {
    g.globalCompositeOperation = 'destination-over' // JPG has no transparency: put white behind
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    out = await toBlob(c, 'image/jpeg')
  }
  if (!out) throw new Error('This picture could not be read.')
  return { blob: out, bitmap }
}

/** Saves a picture under a name made from its content, so the same picture is only stored once. */
async function store(folder: string, source: Blob, max: number): Promise<{ url: string; bitmap: ImageBitmap }> {
  const { blob, bitmap } = await shrink(source, max)
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await source.arrayBuffer()))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
  const path = `${folder}/${hash}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`
  const { error } = await bucket().upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: true })
  if (error) throw error
  return { url: bucket().getPublicUrl(path).data.publicUrl, bitmap }
}

/** Saves any picture as WebP (max `max` px on its longest side) and returns its public link. */
export async function storeImage(folder: string, file: Blob, max = 2000): Promise<string> {
  const { url, bitmap } = await store(folder, file, max)
  bitmap.close()
  return url
}

export async function removeFiles(urls: string[]) {
  const paths = urls.map((u) => u.split('/product-images/')[1]).filter(Boolean)
  if (paths.length) await bucket().remove(paths)
}

/** Middle of the picture, where the garment is. */
function centrePixels(bitmap: ImageBitmap) {
  const c = Object.assign(document.createElement('canvas'), { width: 24, height: 24 })
  const g = c.getContext('2d')!
  g.drawImage(bitmap, bitmap.width * 0.3, bitmap.height * 0.3, bitmap.width * 0.4, bitmap.height * 0.4, 0, 0, 24, 24)
  return g.getImageData(0, 0, 24, 24).data
}

/** Reads one product from Gelato now instead of waiting for the next timed sync. A failure is fine: the timed sync catches up. */
export const syncFromGelato = (id: string) => supabase.functions.invoke('sync-products', { body: { id }, timeout: 25_000 })

export type UploadResult = { text: string; problem: boolean }

/** One read-then-save of a product's pictures at a time, also across tabs, so two uploads never lose each other's pictures. */
export const oneAtATime = <T>(productId: string, fn: () => Promise<T>) => navigator.locks.request(`photos-${productId}`, fn)

/** Unpacks, recognises, uploads and adds to what is there. `color` = the owner says what it shows. Returns a plain-English summary, or null if the owner cancelled. */
export async function uploadMockups(productId: string, files: File[], onProgress: (text: string) => void, color?: string): Promise<UploadResult | null> {
  onProgress('Checking Gelato…')
  await syncFromGelato(productId)
  onProgress('Opening…')
  const { data: p, error } = await supabase.from('products').select('*').eq('id', productId).single()
  if (error) throw error
  const palette = paletteOf(p)
  const { pics, skipped } = await readPics(files)
  if (!pics.length) throw new Error('No pictures found in there. Please choose a Gelato ZIP file or pictures.')
  if (!looksRight(pics.map((x) => x.path), palette.skus)
    && !confirm(`This ZIP looks like it belongs to a different product, not "${p.title}".\n\nUpload it here anyway?`)) return null

  pics.sort((a, b) => viewRank(a.path) - viewRank(b.path) || a.path.localeCompare(b.path))
  // the same picture may be added to several colours (a size chart), but only once to each
  const folder = `mockups/${p.id}${color ? `/${color.replace(/[^a-z0-9]+/gi, '-')}` : ''}`
  const have = asPhotos(p.photos)
  const fileOf = (url: string) => url.split('/').at(-1)
  const added = new Map<string, Photo>()
  const order = new Map<string, number>()
  /** pictures uploaded before the shop knew man / woman: tagged when the same ZIP comes again */
  const retag = new Map<string, Gender>()
  let done = 0, repeats = 0
  const one = async (pic: Pic, i: number) => {
    try {
      const { url, bitmap } = await store(folder, pic.blob, 1600)
      const { gender, ...found } = { ...detect(pic.path, palette), ...(color && { color }) }
      if (added.has(url) || have.some((x) => x.url === url || (fileOf(x.url) === fileOf(url) && (!color || x.color === color)))) {
        repeats++
        if (gender) retag.set(fileOf(url)!, gender)
      } else {
        const guess = found.color || !palette.colors.length ? null : voteColor(centrePixels(bitmap), palette.colors)
        order.set(url, i)
        added.set(url, { url, color: found.color ?? guess, option: found.option, ...(gender && { gender }), ...(guess && { check: true as const }) })
      }
      bitmap.close()
    } catch (e) {
      console.error(pic.path, e)
      skipped.push(pic.path.split('/').at(-1)!)
    }
    onProgress(`Uploading ${++done} of ${pics.length}…`)
  }
  for (let i = 0; i < pics.length; i += 4) await Promise.all(pics.slice(i, i + 4).map((x, n) => one(x, i + n)))

  const list = [...added.values()].sort((a, b) => order.get(a.url)! - order.get(b.url)!)
  const tagged = have.filter((x) => !x.gender && retag.has(fileOf(x.url)!)).length
  if (list.length || tagged) {
    await oneAtATime(p.id, async () => {
      // the sync or another tab may have changed the product meanwhile
      const { data: fresh, error: e2 } = await supabase.from('products').select('photos').eq('id', p.id).single()
      if (e2) throw e2
      const old = asPhotos(fresh.photos).map((x) => (!x.gender && retag.has(fileOf(x.url)!) ? { ...x, gender: retag.get(fileOf(x.url)!) } : x))
      const { error: e3 } = await supabase.from('products').update({ photos: [...old, ...list] as unknown as Json, ...(list.length > 0 && { is_new: false }) }).eq('id', p.id)
      if (e3) throw e3
    })
  }

  const men = list.filter((x) => x.gender === 'male').length, women = list.filter((x) => x.gender === 'female').length
  const per = new Map<string, number>()
  for (const x of list) if (x.color) per.set(x.color, (per.get(x.color) ?? 0) + 1)
  const unknown = palette.colors.length ? list.filter((x) => !x.color).length : 0
  const text = [
    `${list.length} ${list.length === 1 ? 'picture' : 'pictures'} added${per.size ? ` (${[...per].map(([c, n]) => `${c}: ${n}`).join(', ')})` : ''}.`,
    (men || women) && `${men} show a man and ${women} show a woman.`,
    unknown && `${unknown} need a colour. They are at the top, please choose one.`,
    list.some((x) => x.check) && 'Some colours were guessed from the picture. Please check the ones marked "Is this right?".',
    repeats && `${repeats} were already uploaded.`,
    tagged && `${tagged} of those are now marked as man or woman.`,
    skipped.length && `Could not use: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}`,
  ].filter(Boolean).join(' ')
  return { text, problem: !!unknown || !!skipped.length }
}

/** Copies Gelato's short-lived 3D design picture into our storage, unchanged, and returns its lasting link. */
export async function keepModelImage(productId: string, image: string): Promise<string> {
  let blob: Blob
  try {
    const r = await fetch(image)
    if (!r.ok) throw new Error(String(r.status))
    blob = await r.blob()
  } catch {
    throw new Error('This 3D code has run out (Gelato’s codes only work for one day). Please copy a fresh one from Gelato and paste it again.')
  }
  if (!blob.type.startsWith('image/') || blob.size > 20 * 1024 * 1024) throw new Error('Gelato’s 3D picture could not be read. Please copy a fresh code.')
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
  const path = `models/${productId}/${hash}.${blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'}`
  const { error } = await bucket().upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: true })
  if (error) throw error
  return bucket().getPublicUrl(path).data.publicUrl
}
