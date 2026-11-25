import { EyeOff, Star, Trash2, Undo2, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Json } from '../lib/database.types'
import type { Photo } from '../lib/mockups'
import { asPhotos, paletteOf, removeFiles, uploadMockups, type Product, type UploadResult } from '../lib/upload'
import { supabase } from '../lib/supabase'
import { Alert } from './ui'

const NONE = '__none'
const ACCEPT = '.zip,application/zip,application/x-zip-compressed,image/*'

/** One big button that takes a ZIP or pictures, by click or by dropping files on it. */
export function UploadButton({ productId, onDone, big = false }: { productId: string; onDone: (r: UploadResult) => void; big?: boolean }) {
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
      const r = await uploadMockups(productId, files, setBusy)
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
      <span aria-live="polite" className={big ? 'text-lg font-bold text-olive' : ''}>{busy ?? (big ? 'Click here to upload the Gelato ZIP' : 'Upload ZIP')}</span>
      {big && !busy && <span className="text-sm text-muted">or drop the ZIP (or pictures) here. Colours are found for you.</span>}
      <input type="file" accept={ACCEPT} multiple className="sr-only" disabled={!!busy} onChange={(e) => { void go(e.target.files); e.target.value = '' }} />
    </label>
  )
}

/** Every picture of a product with its colour, saved as soon as something is changed. */
export function PhotoManager({ product, onChange }: { product: Product; onChange: () => Promise<void> }) {
  const [photos, setPhotos] = useState(() => asPhotos(product.photos))
  const [from, setFrom] = useState(product)
  if (from !== product) { setFrom(product); setPhotos(asPhotos(product.photos)) } // reloaded after an upload
  const [msg, setMsg] = useState<UploadResult | null>(null)
  const { colors, options } = paletteOf(product)

  const fromGelato = [...new Map(asPhotos(product.gelato_photos).map((g) => [g.url, { ...g, src: 'gelato' as const }])).values()]
  const inGelato = new Set(fromGelato.map((g) => g.url))
  const all: Photo[] = [
    ...fromGelato.map((g) => photos.find((p) => p.url === g.url) ?? g),
    ...photos.filter((p) => p.src !== 'gelato' && !inGelato.has(p.url)),
  ]
  const names = colors.map((c) => c.name)
  const lost = (p: Photo) => names.length > 0 && !names.includes(p.color ?? '')
  const hidden = all.filter((p) => p.hidden)
  const shown = all.filter((p) => !p.hidden)
  const groups = [
    { key: NONE, title: 'Choose a colour for these', items: shown.filter(lost) },
    ...(names.length
      ? colors.map((c) => ({ key: c.name, title: c.name, hex: c.hex, items: shown.filter((p) => p.color === c.name).sort((a, b) => Number(!!b.main) - Number(!!a.main)) }))
      : [{ key: 'all', title: 'Photos', items: shown.sort((a, b) => Number(!!b.main) - Number(!!a.main)) }]),
  ].filter((g) => g.key !== NONE || g.items.length)

  /** Applied to what the database has now, so an upload in another window is never overwritten. */
  const save = async (edit: (list: Photo[]) => Photo[]) => {
    setPhotos(edit(photos))
    const { data, error: readError } = await supabase.from('products').select('photos').eq('id', product.id).single()
    const next = edit(data ? asPhotos(data.photos) : photos)
    const error = readError ?? (await supabase.from('products').update({ photos: next as unknown as Json }).eq('id', product.id)).error
    setPhotos(error ? photos : next)
    setMsg(error ? { text: `Not saved: ${error.message}`, problem: true } : { text: 'Saved.', problem: false })
    return !error
  }
  /** Applies a change to some pictures; Gelato pictures get their own correction entry. */
  const change = (items: Photo[], fn: (p: Photo) => Photo, others: (p: Photo) => Photo = (p) => p) => {
    const urls = new Set(items.map((p) => p.url))
    return save((list) => {
      const known = new Set(list.map((p) => p.url))
      return [...list.map((p) => (urls.has(p.url) ? fn(p) : others(p))), ...items.filter((p) => p.src && !known.has(p.url)).map(fn)]
    })
  }
  const setColor = (items: Photo[], color: string) => change(items, ({ check: _c, main: _m, ...p }) => ({ ...p, color }))
  const makeMain = (p: Photo) => change([p], (x) => ({ ...x, main: true }), ({ main, ...x }) => (main && x.color !== p.color ? { ...x, main } : x))
  const remove = async (p: Photo) => {
    if (p.src === 'gelato') return change([p], (x) => ({ ...x, hidden: true }))
    if (confirm('Delete this picture?') && (await save((list) => list.filter((x) => x.url !== p.url)))) await removeFiles([p.url])
  }

  return (
    <section className="space-y-5">
      <UploadButton big productId={product.id} onDone={(r) => { setMsg(r); void onChange() }} />
      <div aria-live="polite">{msg && <Alert tone={msg.problem ? 'error' : 'success'}>{msg.text}</Alert>}</div>

      {groups.map((g) => (
        <div key={g.key} className={`card p-5 ${g.key === NONE ? 'border-2 border-red-400' : ''}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-3 text-xl">
              {'hex' in g && <span className="size-7 rounded-full ring-1 ring-black/15" style={{ background: g.hex ?? '#ccc' }} />}
              {g.title} <span className="font-sans text-sm font-normal text-muted">{g.items.length || 'no'} {g.items.length === 1 ? 'picture' : 'pictures'}</span>
            </h2>
            {names.length > 1 && g.items.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-muted">Change all {g.items.length} to
                <select className="input w-auto py-2" value="" onChange={(e) => void setColor(g.items, e.target.value)}>
                  <option value="" disabled>choose…</option>
                  {names.filter((n) => n !== g.key).map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
            )}
          </div>
          {g.items.length === 0 && <p className="text-muted">No picture yet, so the shop shows another colour’s picture here.</p>}
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-5">
            {g.items.map((p, i) => (
              <li key={p.url} className={`flex flex-col overflow-hidden rounded-xl border-2 bg-paper ${p.check || lost(p) ? 'border-red-400' : 'border-line'}`}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="relative block">
                  <img src={p.url} alt={`${product.title} ${p.color ?? ''}`} loading="lazy" className="aspect-square w-full bg-cream-2 object-cover" />
                  {i === 0 && !lost(p) && <span className="absolute top-2 left-2 rounded bg-olive px-2 py-0.5 text-xs font-semibold text-white">Main picture</span>}
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
                  {options.length > 0 && (
                    <label className="block text-xs font-semibold text-olive">Design
                      <select className="input mt-1 py-2" value={p.option ?? NONE} onChange={(e) => void change([p], (x) => ({ ...x, option: e.target.value === NONE ? null : e.target.value }))}>
                        <option value={NONE}>All designs</option>
                        {options.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="mt-auto flex flex-wrap gap-1 text-[13px] font-semibold">
                    {i > 0 && !lost(p) && <button type="button" onClick={() => void makeMain(p)} className="flex items-center gap-1 rounded px-2 py-1.5 text-olive hover:bg-cream"><Star className="size-4" aria-hidden /> Make main</button>}
                    <button type="button" onClick={() => void remove(p)} className="flex items-center gap-1 rounded px-2 py-1.5 text-red-700 hover:bg-red-50">
                      {p.src === 'gelato' ? <><EyeOff className="size-4" aria-hidden /> Hide</> : <><Trash2 className="size-4" aria-hidden /> Delete</>}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
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
