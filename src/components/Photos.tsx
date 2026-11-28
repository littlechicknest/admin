import { EyeOff, GripVertical, Trash2, Undo2, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Json } from '../lib/database.types'
import type { Gender, Photo } from '../lib/mockups'
import { asPhotos, oneAtATime, paletteOf, removeFiles, uploadMockups, type Product, type UploadResult } from '../lib/upload'
import { supabase } from '../lib/supabase'
import { Alert } from './ui'

const NONE = '__none'
const ACCEPT = '.zip,application/zip,application/x-zip-compressed,image/*'

/** Takes ZIPs or pictures, by click or by dropping files on it, and adds them. With `color`, loose pictures are all that colour. */
export function UploadButton({ productId, onDone, big = false, color }: { productId: string; onDone: (r: UploadResult) => void; big?: boolean; color?: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  useEffect(() => {
    if (!busy) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  const go = async (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (!files.length || busy) return
    try {
      const r = await uploadMockups(productId, files, setBusy, files.some((f) => /\.zip$/i.test(f.name)) ? undefined : color)
      if (r) onDone(r)
    } catch (e) {
      onDone({ text: e instanceof Error ? e.message : 'Upload failed. Please try again.', problem: true })
    }
    setBusy(null)
  }

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void go(e.dataTransfer.files) }}
      className={`focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange ${big
        ? `flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center ${over ? 'border-orange bg-orange-soft' : 'border-sand bg-paper hover:border-orange'}`
        : `btn-primary cursor-pointer ${over ? 'ring-4 ring-orange/30' : ''}`} ${busy ? 'pointer-events-none opacity-70' : ''}`}>
      <Upload className={big ? 'size-9 text-orange' : 'size-4'} aria-hidden />
      <span aria-live="polite" className={big ? 'text-lg font-bold text-olive' : ''}>{busy ?? (big ? 'Click here to add a Gelato ZIP or your own pictures' : color ? `Add ${color} pictures` : 'Add ZIP or pictures')}</span>
      {big && !busy && <span className="text-sm text-muted">or drop them here. You can add as many ZIPs as you like: new pictures join the ones already here. Colours are found for you.</span>}
      <input type="file" accept={ACCEPT} multiple className="sr-only" disabled={!!busy} onChange={(e) => { void go(e.target.files); e.target.value = '' }} />
    </label>
  )
}

/** Every picture of a product with its colour, saved as soon as something is changed. */
export function PhotoManager({ product, onChange }: { product: Product; onChange: () => Promise<void> }) {
  const [photos, setPhotos] = useState(() => asPhotos(product.photos))
  const [order, setOrder] = useState(product.photo_order)
  const [drag, setDrag] = useState<{ group: string; i: number; over: number } | null>(null)
  const [from, setFrom] = useState(product)
  if (from !== product) { setFrom(product); setPhotos(asPhotos(product.photos)); setOrder(product.photo_order) } // reloaded after an upload
  const [msg, setMsg] = useState<UploadResult | null>(null)
  const { colors, options } = paletteOf(product)

  const fromGelato = [...new Map(asPhotos(product.gelato_photos).map((g) => [g.url, { ...g, src: 'gelato' as const }])).values()]
  const inGelato = new Set(fromGelato.map((g) => g.url))
  const rank = (p: Photo) => (order.includes(p.url) ? order.indexOf(p.url) : order.length)
  const all: Photo[] = [
    ...fromGelato.map((g) => photos.find((p) => p.url === g.url) ?? g),
    ...photos.filter((p) => p.src !== 'gelato' && !inGelato.has(p.url)),
  ].sort((a, b) => rank(a) - rank(b))
  const names = colors.map((c) => c.name)
  // clothes for grown-ups can show a man or a woman wearing them
  const people = ['Men', 'Women', 'Unisex'].includes(product.category) || all.some((p) => p.gender)
  // Unisex: each colour's pictures in a Man, a Woman and an "everyone" part, as the shop's Men / Women pages use them
  const split = product.category === 'Unisex'
  const partsOf = (items: Photo[], byGender: boolean) => byGender
    ? [
        { key: 'male', title: 'Man', note: 'Shown on the Men page. Number 1 is the main picture there.', items: items.filter((p) => p.gender === 'male') },
        { key: 'female', title: 'Woman', note: 'Shown on the Women page. Number 1 is the main picture there.', items: items.filter((p) => p.gender === 'female') },
        { key: 'other', title: 'Gelato picture and pictures with nobody', note: 'Gelato’s picture is shown only on the Unisex page. Pictures with nobody show on both, after the Man / Woman ones.', items: items.filter((p) => p.gender !== 'male' && p.gender !== 'female') },
      ]
    : [{ key: 'all', title: '', note: '', items }]
  const lost = (p: Photo) => names.length > 0 && !names.includes(p.color ?? '')
  const hidden = all.filter((p) => p.hidden)
  const shown = all.filter((p) => !p.hidden)
  const groups = [
    { key: NONE, title: 'Choose a colour for these', items: shown.filter(lost) },
    ...(names.length
      ? colors.map((c) => ({ key: c.name, title: c.name, hex: c.hex, items: shown.filter((p) => p.color === c.name) }))
      : [{ key: 'all', title: 'Photos', items: shown }]),
  ].filter((g) => g.key !== NONE || g.items.length)

  /** Applied to what the database has now, so an upload in another window is never overwritten. */
  const save = async (edit: (list: Photo[]) => Photo[]) => {
    setPhotos(edit(photos))
    const { next, error } = await oneAtATime(product.id, async () => {
      const { data, error } = await supabase.from('products').select('photos').eq('id', product.id).single()
      const next = edit(data ? asPhotos(data.photos) : photos)
      return { next, error: error ?? (await supabase.from('products').update({ photos: next as unknown as Json }).eq('id', product.id)).error }
    })
    setPhotos(error ? photos : next)
    setMsg(error ? { text: `Not saved: ${error.message}`, problem: true } : { text: 'Saved.', problem: false })
    return !error
  }
  /** Applies a change to some pictures; Gelato pictures get their own correction entry. */
  const change = (items: Photo[], fn: (p: Photo) => Photo) => {
    const urls = new Set(items.map((p) => p.url))
    return save((list) => {
      const known = new Set(list.map((p) => p.url))
      return [...list.map((p) => (urls.has(p.url) ? fn(p) : p)), ...items.filter((p) => p.src && !known.has(p.url)).map(fn)]
    })
  }
  const setColor = (items: Photo[], color: string) => change(items, ({ check: _c, ...p }) => ({ ...p, color }))
  /** Moves a picture to another place among `part` (some or all of its colour's pictures); the colour's other pictures keep their places. */
  const move = async (items: Photo[], part: Photo[], i: number, to: number) => {
    if (i === to) return
    const moved = part.map((p) => p.url)
    moved.splice(to, 0, ...moved.splice(i, 1))
    const inPart = new Set(moved)
    let k = 0
    const urls = items.map((p) => (inPart.has(p.url) ? moved[k++] : p.url))
    const next = [...order.filter((u) => !urls.includes(u) && all.some((p) => p.url === u)), ...urls]
    setOrder(next)
    const { error } = await supabase.from('products').update({ photo_order: next }).eq('id', product.id)
    if (error) setOrder(order)
    setMsg(error ? { text: `Not saved: ${error.message}`, problem: true } : { text: 'Saved.', problem: false })
  }
  const remove = async (p: Photo) => {
    if (p.src === 'gelato') return change([p], (x) => ({ ...x, hidden: true }))
    if (confirm('Delete this picture?') && (await save((list) => list.filter((x) => x.url !== p.url)))) await removeFiles([p.url])
  }

  /** Deletes every picture the owner added (ZIPs and own pictures); Gelato's own pictures stay. */
  const mine = all.filter((p) => p.src !== 'gelato')
  const [clearing, setClearing] = useState(false)
  const removeMine = async () => {
    if (!mine.length || !confirm(`Delete all ${mine.length} of your pictures from this product?

Gelato’s own pictures stay. This cannot be undone, but you can upload the ZIP again.`)) return
    setClearing(true)
    const urls = new Set(mine.map((p) => p.url))
    if (await save((list) => list.filter((x) => x.src === 'gelato' || inGelato.has(x.url)))) {
      await removeFiles([...urls]).catch(() => undefined)
      setMsg({ text: `Deleted ${urls.size} ${urls.size === 1 ? 'picture' : 'pictures'}. Gelato’s pictures are still here.`, problem: false })
      void onChange()
    }
    setClearing(false)
  }

  const uploaded = (r: UploadResult) => { setMsg(r); void onChange() }

  return (
    <section className="space-y-5">
      <UploadButton big productId={product.id} onDone={uploaded} />
      {mine.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-red-200 bg-paper p-4">
          <p className="text-base text-olive">You added <strong>{mine.length}</strong> {mine.length === 1 ? 'picture' : 'pictures'} here. Gelato’s own pictures are not counted.</p>
          <button type="button" disabled={clearing} onClick={() => void removeMine()} className="flex items-center gap-2 rounded-lg border-2 border-red-300 bg-white px-4 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
            <Trash2 className="size-5" aria-hidden /> {clearing ? 'Deleting…' : `Delete all my pictures (${mine.length})`}
          </button>
        </div>
      )}
      <div aria-live="polite" className="sticky top-2 z-10">{msg && <Alert tone={msg.problem ? 'error' : 'success'}>{msg.text}</Alert>}</div>

      {people && (
        <p className="rounded-xl bg-orange-soft p-4 text-base text-olive">
          <strong>Man or woman:</strong> pictures are marked for you from their file names (for example <em>person2_female_front</em>). For a Unisex product, the shop’s <strong>Men</strong> page shows only the pictures marked <strong>Man</strong> and the <strong>Women</strong> page only those marked <strong>Woman</strong>, without Gelato’s plain picture. Pictures with nobody in them show on both. Change it under a picture if it is wrong.{product.category === 'Unisex' && <> Below, each colour is split into <strong>Man</strong>, <strong>Woman</strong> and <strong>everyone</strong> pictures.</>}
        </p>
      )}

      <p className="flex items-center gap-2 text-base text-olive"><GripVertical className="size-5 shrink-0" aria-hidden /> Drag a picture to change its place, or choose a number under it. Number 1 is the main picture.</p>

      {groups.map((g) => (
        <div key={g.key} className={`card p-5 ${g.key === NONE ? 'border-2 border-red-400' : ''}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-3 text-xl">
              {'hex' in g && <span className="size-7 rounded-full ring-1 ring-black/15" style={{ background: g.hex ?? '#ccc' }} />}
              {g.title} <span className="font-sans text-sm font-normal text-muted">{g.items.length || 'no'} {g.items.length === 1 ? 'picture' : 'pictures'}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {names.length > 1 && g.items.length > 1 && (
                <label className="flex items-center gap-2 text-sm text-muted">Change all {g.items.length} to
                  <select className="input w-auto py-2" value="" onChange={(e) => void setColor(g.items, e.target.value)}>
                    <option value="" disabled>choose…</option>
                    {names.filter((n) => n !== g.key).map((n) => <option key={n}>{n}</option>)}
                  </select>
                </label>
              )}
              {names.length > 0 && g.key !== NONE && <UploadButton productId={product.id} color={g.key} onDone={uploaded} />}
            </div>
          </div>
          {g.items.length === 0 && <p className="text-muted">No picture yet, so the shop shows another colour’s picture here. In Gelato, select the main mockup for this colour and save, or add your own picture with the button.</p>}
          {g.items.length > 0 && partsOf(g.items, split && g.key !== NONE).map((part) => {
            const dk = `${g.key}|${part.key}`
            return (
              <div key={part.key} className={split && g.key !== NONE ? 'mt-4 border-t border-line pt-4 first:mt-0 first:border-0 first:pt-0' : ''}>
                {split && g.key !== NONE && (
                  <h3 className="mb-3 flex flex-wrap items-baseline gap-x-3 text-lg">{part.title}
                    <span className="font-sans text-sm font-normal text-muted">{part.items.length || 'no'} {part.items.length === 1 ? 'picture' : 'pictures'} · {part.note}</span>
                  </h3>
                )}
                {split && g.key !== NONE && part.key !== 'other' && !part.items.length && g.items.length > 0 && (
                  <p className="mb-2 text-muted">None yet, so the {part.key === 'male' ? 'Men' : 'Women'} page shows this colour’s other pictures. Change “Who is wearing it” under a picture, or upload the Gelato ZIP again.</p>
                )}
              <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                {part.items.map((p, i) => (
                  <li key={p.url} draggable={g.key !== NONE && part.items.length > 1}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.url); setDrag({ group: dk, i, over: i }) }}
                    onDragOver={(e) => { if (drag?.group === dk) { e.preventDefault(); if (drag.over !== i) setDrag({ ...drag, over: i }) } }}
                    onDrop={(e) => { if (drag?.group === dk) { e.preventDefault(); void move(g.items, part.items, drag.i, i) } }}
                    onDragEnd={() => setDrag(null)}
                    className={`${g.key !== NONE && part.items.length > 1 ? 'cursor-grab' : ''} ${drag?.group === dk && drag.i === i ? 'opacity-40' : ''} ${drag?.group === dk && drag.over === i && drag.i !== i ? 'ring-4 ring-orange' : ''} flex flex-col overflow-hidden rounded-xl border-2 bg-paper ${p.check || lost(p) ? 'border-red-400' : 'border-line'}`}>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" draggable={false} className="relative block cursor-[inherit]">
                      <img src={p.url} alt={`${product.title} ${p.color ?? ''}`} loading="lazy" draggable={false} className="aspect-square w-full bg-cream-2 object-cover" />
                      {!lost(p) && <span className="absolute top-2 left-2 rounded bg-olive px-2 py-0.5 text-sm font-semibold text-white">{i === 0 && part.key !== 'other' ? '1 · Main picture' : i + 1}</span>}
                      {people && (p.gender || p.src === 'gelato') && <span className="absolute right-2 bottom-2 rounded bg-white/90 px-2 py-0.5 text-sm font-semibold text-olive">{p.src === 'gelato' ? 'Gelato' : p.gender === 'male' ? 'Man' : 'Woman'}</span>}
                    </a>
                    <div className="flex flex-1 flex-col gap-2 p-3">
                      {names.length > 0 && (
                        <label className="block text-xs font-semibold text-olive">{p.check ? <span className="text-red-700">Is this right?</span> : 'Colour'}
                          <select className="input mt-1 py-2" value={lost(p) ? '' : p.color ?? ''} onChange={(e) => void setColor([p], e.target.value)}>
                            {lost(p) && <option value="" disabled>Choose a colour…</option>}
                            {names.map((n) => <option key={n}>{n}</option>)}
                          </select>
                        </label>
                      )}
                      {p.check && <button type="button" className="btn-dark py-2" onClick={() => void change([p], ({ check: _c, ...x }) => x)}>Yes, it is {p.color}</button>}
                      {people && p.src !== 'gelato' && (
                        <label className="block text-xs font-semibold text-olive">Who is wearing it
                          <select className="input mt-1 py-2" value={p.gender ?? NONE} onChange={(e) => void change([p], ({ gender: _g, ...x }) => (e.target.value === NONE ? x : { ...x, gender: e.target.value as Gender }))}>
                            <option value={NONE}>Nobody / both</option>
                            <option value="male">Man</option>
                            <option value="female">Woman</option>
                          </select>
                        </label>
                      )}
                      {options.length > 0 && (
                        <label className="block text-xs font-semibold text-olive">Design
                          <select className="input mt-1 py-2" value={p.option ?? NONE} onChange={(e) => void change([p], (x) => ({ ...x, option: e.target.value === NONE ? null : e.target.value }))}>
                            <option value={NONE}>All designs</option>
                            {options.map((o) => <option key={o}>{o}</option>)}
                          </select>
                        </label>
                      )}
                      {g.key !== NONE && part.items.length > 1 && (
                        <label className="block text-xs font-semibold text-olive">Position
                          <select className="input mt-1 py-2" value={i} onChange={(e) => void move(g.items, part.items, i, Number(e.target.value))}>
                            {part.items.map((x, n) => <option key={x.url} value={n}>{n === 0 ? '1 (main)' : n + 1}</option>)}
                          </select>
                        </label>
                      )}
                      <div className="mt-auto flex flex-wrap gap-1 text-[13px] font-semibold">
                        <button type="button" onClick={() => void remove(p)} className="flex items-center gap-1 rounded px-2 py-1.5 text-red-700 hover:bg-red-50">
                          {p.src === 'gelato' ? <><EyeOff className="size-4" aria-hidden /> Hide</> : <><Trash2 className="size-4" aria-hidden /> Delete</>}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              </div>
            )
          })}
        </div>
      ))}

      {hidden.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-4 text-xl">Hidden pictures</h2>
          <ul className="flex flex-wrap gap-3">
            {hidden.map((p) => (
              <li key={p.url} className="w-32"><img src={p.url} alt="" className="aspect-square w-full rounded-lg bg-cream-2 object-cover opacity-60" />
                <button type="button" onClick={() => void change([p], ({ hidden: _h, ...x }) => x)} className="mt-1 flex items-center gap-1 text-sm font-semibold text-olive hover:underline"><Undo2 className="size-4" aria-hidden /> Show again</button></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
