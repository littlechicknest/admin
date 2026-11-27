// Pure helpers for the picture optimiser (no Supabase import, so tests run without settings).

/** Pictures in our own storage that are not WebP yet (Gelato sends JPG/PNG). Website files and outside links are left alone. */
export const needsWebp = (u: unknown): u is string =>
  typeof u === 'string' && u.includes('/storage/v1/object/public/product-images/') && !/\.webp(\?|$)/i.test(u)

/** Every not-yet-WebP link inside a value, however deeply it is nested. */
export function collect(v: unknown, out: Set<string>) {
  if (needsWebp(v)) out.add(v)
  else if (Array.isArray(v)) v.forEach((x) => collect(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collect(x, out))
}

/** The same value with old links swapped for new ones. */
export function swap<T>(v: T, map: Map<string, string>): T {
  if (typeof v === 'string') return (map.get(v) ?? v) as T
  if (Array.isArray(v)) return v.map((x) => swap(x, map)) as T
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x, map)])) as T
  return v
}
