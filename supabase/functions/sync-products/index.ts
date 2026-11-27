// Mirrors the Gelato store into public.products. Called by pg_cron every 5 minutes or by an admin; `{ id }` syncs that one product.
import { keepPhotos, toProduct, type GelatoImage, type Photo } from '../_shared/catalog.ts'
import { listProductIds, loadProduct, usdRate } from '../_shared/gelato.ts'
import { admin, cors, fail, isCronOrAdmin, json } from '../_shared/util.ts'

const bucket = admin.storage.from('product-images')

/** Gelato's image links expire after 24h, so each picture is copied once into our bucket, named by its content. */
async function keepImage(img: GelatoImage): Promise<string> {
  const res = await fetch(img.fileUrl, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`image ${res.status}`)
  const bytes = await res.arrayBuffer()
  const type = res.headers.get('content-type') ?? 'image/jpeg'
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
  const path = `gelato/${hash}.${type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'}`
  const { error } = await bucket.upload(path, bytes, { contentType: type, cacheControl: '31536000', upsert: true })
  if (error) throw error
  return bucket.getPublicUrl(path).data.publicUrl
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed')
  if (!(await isCronOrAdmin(req))) return fail(req, 403, 'Forbidden')

  try {
    const { id: only } = await req.json().catch(() => ({})) as { id?: string }
    const { data: rows, error } = await admin.from('products').select('id,external_product_id,gelato_images,gelato_photos,is_active').eq('source', 'gelato')
    if (error) throw error
    const ids = only ? (rows ?? []).filter((r) => r.id === only).map((r) => r.external_product_id as string) : await listProductIds()
    const known = new Map((rows ?? []).map((r) => [r.external_product_id, r]))
    let rate: Promise<number> | undefined
    let gbp: Promise<number> | undefined // USD per GBP, for the shop's currency switch
    let ok = 0
    const failed: string[] = []

    const syncOne = async (id: string) => {
      const [p, variants] = await loadProduct(id)
      if (!variants.length) return
      rate ??= usdRate(variants[0].productUid, variants[0].currency)
      gbp ??= variants[0].currency === 'GBP' ? rate : usdRate(variants[0].productUid, 'GBP')
      const row = known.get(id)
      const urls = { ...(row?.gelato_images as Record<string, string> | undefined) }
      for (const img of p.productImages) urls[img.id] ??= await keepImage(img)
      const product = toProduct(p, variants, urls, await rate)
      if (!product) return
      const gelato_images = Object.fromEntries(p.productImages.map((i) => [i.id, urls[i.id]]))
      product.gelato_photos = keepPhotos(product.gelato_photos, (row?.gelato_photos ?? []) as Photo[], product.variants)
      const { category, ...synced } = product // the admin may move a product to another category
      const { error } = row
        ? await admin.from('products').update({ ...synced, gelato_images }).eq('id', row.id)
        : await admin.from('products').insert({ ...synced, category, gelato_images, is_new: true })
      if (error) throw error
      ok++
    }
    for (let i = 0; i < ids.length; i += 5) {
      await Promise.all(ids.slice(i, i + 5).map((id) => syncOne(id).catch((e) => {
        failed.push(id)
        console.error('product', id, e instanceof Error ? e.message : JSON.stringify(e))
      })))
    }

    // same rate the prices were converted with, so a GBP price shows back exactly as set in Gelato
    const usd_rates = gbp && { GBP: await gbp.catch(() => 0) }
    if (usd_rates?.GBP) await admin.from('store_settings').update({ usd_rates }).eq('id', 1)

    if (only) return json(req, { message: `Synced ${ok} of ${ids.length} Gelato products.` })

    // deleted in Gelato: hide, so it can't be bought but keeps its reviews and order links
    const gone = (rows ?? []).filter((r) => r.is_active && !ids.includes(r.external_product_id))
    if (ids.length && gone.length) await admin.from('products').update({ is_active: false }).in('id', gone.map((r) => r.id))
    if (ok) await admin.from('store_settings').update({ last_product_sync: new Date().toISOString() }).eq('id', 1)
    return json(req, { message: `Synced ${ok} of ${ids.length} Gelato products${failed.length ? `, ${failed.length} will be retried` : ''}.` })
  } catch (e) {
    console.error('sync-products', e instanceof Error ? e.message : e)
    return fail(req, 502, e instanceof Error ? e.message : 'Sync failed')
  }
})
