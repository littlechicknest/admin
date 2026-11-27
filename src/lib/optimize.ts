import type { Tables } from './database.types'
import { supabase } from './supabase'
import { collect, swap } from './links'
import { oneAtATime, storeImage } from './upload'

// Gelato products: the database rebuilds variants/images from these; own products keep their pictures in images/variants
const GELATO_COLS = ['gelato_images', 'gelato_photos', 'photos', 'photo_order'] as const
const MANUAL_COLS = ['images', 'variants'] as const
const SELECT = 'id,source,gelato_images,gelato_photos,photos,photo_order,images,variants'

let running: Promise<number> | null = null

/**
 * Turns every product and website picture that is still JPG/PNG into a smaller WebP (max 1600px) and points everything at it.
 * Safe to run any time and more than once; runs once at a time. Returns how many pictures were converted.
 * Old files are kept, so past orders and anything cached still show their picture.
 */
export function optimiseAll(onProgress?: (done: number, total: number) => void): Promise<number> {
  running ??= run(onProgress).finally(() => { running = null })
  return running
}

async function run(onProgress?: (done: number, total: number) => void): Promise<number> {
  const [{ data: products, error }, { data: settings }] = await Promise.all([
    supabase.from('products').select(SELECT),
    supabase.from('store_settings').select('site_images').eq('id', 1).single(),
  ])
  if (error) throw error
  const todo = new Set<string>()
  collect(products, todo)
  collect(settings?.site_images, todo)
  if (!todo.size) return 0

  const map = new Map<string, string>()
  const urls = [...todo]
  let done = 0
  const one = async (url: string) => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status}`)
      const folder = url.split('/product-images/')[1].split('/').slice(0, -1).join('/') || 'optimised'
      map.set(url, await storeImage(folder, await res.blob(), 1600))
    } catch (e) {
      console.warn('could not optimise', url, e) // tried again next time
    }
    onProgress?.(++done, urls.length)
  }
  for (let i = 0; i < urls.length; i += 4) await Promise.all(urls.slice(i, i + 4).map(one))
  if (!map.size) return 0

  for (const p of products ?? []) {
    const has = new Set<string>()
    collect(p, has)
    if (![...has].some((u) => map.has(u))) continue
    // read again just before saving: the Gelato sync or another tab may have changed the product meanwhile
    await oneAtATime(p.id, async () => {
      const { data: fresh } = await supabase.from('products').select(SELECT).eq('id', p.id).single()
      if (!fresh) return
      const cols = fresh.source === 'gelato' ? GELATO_COLS : MANUAL_COLS
      const change = Object.fromEntries(cols.map((c) => [c, swap(fresh[c], map)])) as Partial<Tables<'products'>>
      await supabase.from('products').update(change).eq('id', p.id)
    })
  }
  if (settings?.site_images) {
    const { data: fresh } = await supabase.from('store_settings').select('site_images').eq('id', 1).single()
    if (fresh) await supabase.from('store_settings').update({ site_images: swap(fresh.site_images, map) }).eq('id', 1)
  }
  return map.size
}
