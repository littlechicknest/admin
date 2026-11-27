import type { Json } from './database.types'

export const SHOP_URL = 'https://littlechicknest.github.io/littlechicknest/'

export const CATEGORIES = ['Men', 'Women', 'Kids', 'Accessories'] as const
/** Every category a product can be in (the database allows exactly these). Unisex shows under both Men and Women. */
export const ALL_CATEGORIES = ['Men', 'Women', 'Unisex', 'Kids', 'Accessories'] as const
/** `option` names what `sizes` holds when it isn't sizes (e.g. a design choice). */
export type Variant = { color: string; hex?: string; option?: string; sizes: string[]; images: string[] }

export type OrderItem = {
  product_id: string
  title: string
  color: string | null
  size: string | null
  quantity: number
  unit_price: number
  image: string | null
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const formatMoney = (n: number | string | null | undefined) => money.format(Number(n ?? 0))

/** Same formula as public.product_price() in SQL; used only for the admin live preview. */
export const marginPrice = (base: number, marginPercent: number) =>
  Math.round(Math.round(base * 100) * (100 + marginPercent) / 100) / 100

/** Lowest shop price of a product: the Gelato retail price per colour/size, else cost + margin; own products have one price. */
export function fromPrice(p: { source: string; manual_price: number | null; base_price: number | null; skus: Json }, margin: number) {
  if (p.source === 'manual') return Number(p.manual_price ?? 0)
  const skus = Array.isArray(p.skus) ? (p.skus as { cost?: number; price?: number }[]) : []
  const prices = skus.map((s) => (Number(s.price) > 0 ? Number(s.price) : marginPrice(Number(s.cost ?? 0), margin))).filter((n) => n > 0)
  return prices.length ? Math.min(...prices) : marginPrice(Number(p.base_price ?? 0), margin)
}

export const asVariants = (v: Json): Variant[] =>
  Array.isArray(v)
    ? v.flatMap((x) => {
        if (!x || typeof x !== 'object' || Array.isArray(x)) return []
        const o = x as Record<string, Json | undefined>
        if (typeof o.color !== 'string' || !o.color) return []
        return [{
          color: o.color,
          hex: typeof o.hex === 'string' ? o.hex : undefined,
          option: typeof o.option === 'string' ? o.option : undefined,
          sizes: Array.isArray(o.sizes) ? o.sizes.filter((s): s is string => typeof s === 'string') : [],
          images: Array.isArray(o.images) ? o.images.filter((s): s is string => typeof s === 'string') : [],
        }]
      })
    : []

export const asItems = (v: Json): OrderItem[] => (Array.isArray(v) ? (v as unknown as OrderItem[]) : [])

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting payment',
  paid: 'Order placed',
  processing: 'Processing',
  printing: 'Printing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}
export const ALL_STATUSES = Object.keys(STATUS_LABEL)

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

/** Only allow http(s) URLs into src/href attributes. */
export const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : null)

/** Image source: full http(s) URLs, or a path to a file shipped with the shop (e.g. "products/cap.webp"). */
export const imgSrc = (u: string | null | undefined) =>
  safeUrl(u) ?? (u && /^[a-z0-9][\w\-/]*\.(webp|png|jpe?g|avif)$/i.test(u) ? SHOP_URL + u : null)
