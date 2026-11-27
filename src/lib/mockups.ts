// Reads a Gelato mockup zip (or loose pictures) and works out which colour each picture shows.
import { unzipSync } from 'fflate'

/** One picture of a product. `src: 'gelato'` corrects a picture that comes from Gelato; `check` = colour guessed from the pixels. */
export type Photo = { url: string; color: string | null; option: string | null; gender?: Gender; src?: 'gelato'; hidden?: true; check?: true }
/** Who wears it in the picture; none = no person, or both. Unisex products show only one in the shop's Men / Women pages. */
export type Gender = 'male' | 'female'
export type Palette = {
  colors: { name: string; hex?: string }[]
  /** design choices ("Design Option 1"); empty for products with normal sizes */
  options: string[]
  skus: { color: string | null; size: string | null; uid: string }[]
}

const norm = (s: string) => s.toLowerCase().replace(/grey/g, 'gray').replace(/[^a-z0-9]+/g, ' ').trim()
/** Gelato product code without the size, so any size's folder matches. */
const noSize = (uid: string) => uid.toLowerCase().replace(/_gsi_[^_]+/, '')
const hasWords = (text: string, words: string) => ` ${text} `.includes(` ${words} `) || (words.includes(' ') && text.replace(/ /g, '').includes(words.replace(/ /g, '')))

/** Finds a colour name in some text: full names first (longest wins), then a unique last word ("red" for "Ceramic Red"). */
function colorIn(text: string, names: string[]): string | null {
  const t = norm(text)
  const full = names.filter((n) => hasWords(t, norm(n))).sort((a, b) => b.length - a.length)[0]
  if (full) return full
  const last = names.filter((n) => hasWords(t, norm(n).split(' ').at(-1)!))
  return last.length === 1 ? last[0] : null
}

function detectColor(path: string, { colors, skus }: Palette): string | null {
  const parts = path.split('/').reverse() // file name first, then its folder, …
  const names = colors.map((c) => c.name)
  // 1. Gelato names folders by product code: exact, whatever the colour is called
  for (const part of parts) {
    const hit = new Set(skus.filter((s) => noSize(s.uid) === noSize(part)).map((s) => s.color))
    if (hit.size === 1) return [...hit][0]
  }
  // 2. the colour part of any Gelato code
  for (const part of parts) {
    const code = part.match(/_gco_(.+?)(?:_g[a-z]{2}_|$)/i)?.[1]
    const hit = code && colorIn(code, names)
    if (hit) return hit
  }
  // 3. colour words in the folder names, then in the file name
  for (const part of [...parts.slice(1), parts[0]]) {
    const hit = colorIn(part, names)
    if (hit) return hit
  }
  return names.length === 1 ? names[0] : null
}

function detectOption(path: string, options: string[]): string | null {
  const t = norm(path)
  const n = t.match(/\b(?:option|design|logo)(?: option)? (\d+)\b/)?.[1]
  return options.find((o) => hasWords(t, norm(o))) ?? (n && options.find((o) => norm(o).endsWith(` ${n}`))) ?? null
}

/** "person2_female_front", "model_woman1", "premium_model_male_man2": female words are checked first ("female" contains "male"). */
export function detectGender(path: string): Gender | null {
  const t = norm(path.split('/').at(-1)!.replace(/\.[a-z0-9]+$/i, ''))
  if (/\b(female|woman|women|womens|lady|ladies)\d*\b/.test(t)) return 'female'
  if (/\b(male|man|men|mens)\d*\b/.test(t)) return 'male'
  return null
}

export const detect = (path: string, p: Palette) => ({ color: detectColor(path, p), option: detectOption(path, p.options), gender: detectGender(path) })

/** False when the zip's Gelato folders all belong to some other product. */
export function looksRight(paths: string[], skus: Palette['skus']) {
  const ours = new Set(skus.map((s) => noSize(s.uid).replace(/_gco_.+?(?=_g[a-z]{2}_|$)/, '')))
  const codes = paths.flatMap((p) => p.split('/')).filter((x) => /_gco_/i.test(x)).map((x) => noSize(x).replace(/_gco_.+?(?=_g[a-z]{2}_|$)/, ''))
  return !codes.length || codes.some((c) => ours.has(c))
}

/** Front views first, back views last, so the first uploaded picture makes a good main picture. */
export const viewRank = (path: string) => {
  const file = path.split('/').at(-1)!
  return /front/i.test(file) ? 0 : /back/i.test(file) ? 2 : 1
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
/** Last resort: the product colour closest to most pixels, if there is a clear winner. */
export function voteColor(rgba: ArrayLike<number>, colors: Palette['colors']): string | null {
  const known = colors.flatMap((c) => (c.hex && /^#[0-9a-f]{6}$/i.test(c.hex) ? [{ name: c.name, v: rgb(c.hex), n: 0 }] : []))
  if (!known.length) return null
  for (let i = 0; i < rgba.length; i += 4) {
    let best = known[0], bd = Infinity
    for (const k of known) {
      const d = (rgba[i] - k.v[0]) ** 2 + (rgba[i + 1] - k.v[1]) ** 2 + (rgba[i + 2] - k.v[2]) ** 2
      if (d < bd) { bd = d; best = k }
    }
    if (bd < 9000) best.n++ // further away means it is none of them
  }
  const top = known.sort((a, b) => b.n - a.n)[0]
  return top.n > rgba.length / 4 * 0.45 ? top.name : null
}

export type Pic = { path: string; blob: Blob }
const IMAGE = /\.(jpe?g|png|webp|avif|gif|bmp)$/i
const MAX_FILE = 40 * 1024 * 1024, MAX_TOTAL = 800 * 1024 * 1024, MAX_PICS = 300

/** Pictures from zips and loose files. `skipped` = files that aren't pictures we can use. */
export async function readPics(files: File[]): Promise<{ pics: Pic[]; skipped: string[] }> {
  const pics: Pic[] = [], skipped: string[] = []
  let total = 0
  for (const f of files) {
    if (!/\.zip$/i.test(f.name)) {
      if (IMAGE.test(f.name) || f.type.startsWith('image/')) pics.push({ path: f.name, blob: f })
      else skipped.push(f.name)
      continue
    }
    const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), {
      filter: ({ name, originalSize }) => {
        if (name.endsWith('/') || /(^|\/)(__MACOSX\/|\.)/.test(name)) return false
        total += originalSize
        const ok = IMAGE.test(name) && originalSize <= MAX_FILE && total <= MAX_TOTAL
        if (!ok) skipped.push(name.split('/').at(-1)!)
        return ok
      },
    })
    for (const [path, bytes] of Object.entries(entries)) pics.push({ path, blob: new Blob([bytes as Uint8Array<ArrayBuffer>]) })
  }
  if (pics.length > MAX_PICS) throw new Error(`That is ${pics.length} pictures. Please upload ${MAX_PICS} or fewer at a time.`)
  return { pics, skipped }
}
