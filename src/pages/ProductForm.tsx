import { ArrowLeft, ArrowRight, Check, ChevronLeft, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ModelManager } from '../components/Models'
import { PhotoManager } from '../components/Photos'
import { Alert, Field, Section, Spinner, useTitle, useToast } from '../components/ui'
import type { Json, Tables } from '../lib/database.types'
import { ALL_CATEGORIES, asVariants, formatMoney, fromPrice, imgSrc, safeUrl, SHOP_URL } from '../lib/shop'
import { supabase } from '../lib/supabase'
import { storeImage, syncFromGelato } from '../lib/upload'
import { AdminTitle } from './AdminLayout'
import { Toggle, useMargin } from './AdminProducts'

type Row = Tables<'products'>
type Colour = { color: string; hex: string; images: string[] }

type FormState = {
  title: string
  description: string
  category: string
  price: string
  photos: string[]
  sizes: string[]
  colours: Colour[]
  is_active: boolean
  is_featured: boolean
  print_front: string
  print_back: string
}

const EMPTY: FormState = {
  title: '', description: '', category: '', price: '', photos: [], sizes: [], colours: [],
  is_active: true, is_featured: false, print_front: '', print_back: '',
}

const SIZE_SETS = [
  { label: 'Adult clothing', sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] },
  { label: 'Kids', sizes: ['0-6M', '6-12M', '1-2Y', '3-4Y', '5-6Y', '7-8Y', '9-11Y', '12-13Y'] },
]
// a product sold in sizes only still needs one "colour" for the shop and basket; the shop hides it
const NO_COLOUR = 'Standard'

/** Own products: one set of sizes for every colour. */
function fromRow(r: Row): FormState {
  const v = asVariants(r.variants)
  const pf = (r.print_files ?? {}) as Record<string, string>
  return {
    title: r.title, description: r.description, category: r.category, price: r.manual_price?.toString() ?? '',
    photos: r.images, sizes: [...new Set(v.flatMap((x) => x.sizes))],
    colours: v.filter((x) => !(v.length === 1 && x.color === NO_COLOUR)).map((x) => ({ color: x.color, hex: x.hex ?? '#cccccc', images: x.images })),
    is_active: r.is_active, is_featured: r.is_featured, print_front: pf.front ?? '', print_back: pf.back ?? '',
  }
}

export function ProductForm() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  useTitle(isNew ? 'Add product' : 'Edit product')
  const navigate = useNavigate()
  const margin = useMargin()
  const [f, setF] = useState<FormState | null>(isNew ? EMPTY : null)
  const [row, setRow] = useState<Row | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, say] = useToast()

  const reloadRow = useCallback(async () => {
    const { data } = await supabase.from('products').select('*').eq('id', id!).single()
    if (data) setRow(data)
  }, [id])

  useEffect(() => {
    if (isNew) return
    supabase.from('products').select('*').eq('id', id!).maybeSingle().then(({ data, error }) => {
      if (error || !data) return setError('This product was not found. It may have been deleted.')
      setRow(data)
      setF(fromRow(data))
      if (data.source === 'gelato') void syncFromGelato(data.id).then(reloadRow)
    })
  }, [id, isNew, reloadRow])

  if (!f) return error ? <Alert>{error}</Alert> : <Spinner />
  const gelato = row?.source === 'gelato'
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => (s ? { ...s, [k]: v } : s))
  const setColour = (i: number, change: Partial<Colour>) => set('colours', f.colours.map((c, j) => (j === i ? { ...c, ...change } : c)))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const fail = (text: string) => { setError(text); window.scrollTo({ top: 0, behavior: 'smooth' }) }
    if (!f.category) return fail('Please choose a category.')
    for (const u of [f.print_front, f.print_back]) if (u && !safeUrl(u)) return fail('Print file links must start with https://')

    const own = { // the only things the shop decides for a Gelato product; the rest comes from Gelato
      category: f.category, is_active: f.is_active, is_featured: f.is_featured,
      print_files: { ...(f.print_front && { front: f.print_front }), ...(f.print_back && { back: f.print_back }) },
    }
    let payload: Partial<Row> = own
    if (!gelato) {
      const price = Number(f.price.replace(',', '.'))
      if (!f.title.trim()) return fail('Please give the product a name.')
      if (f.price.trim() === '' || !(price > 0)) return fail('Please enter a price, for example 24.99')
      if (!f.photos.length && !f.colours.some((c) => c.images.length)) return fail('Please add at least one photo so customers can see it.')
      const names = f.colours.map((c) => c.color.trim().toLowerCase())
      if (names.some((n) => !n)) return fail('Every colour needs a name, for example "Navy".')
      if (new Set(names).size !== names.length) return fail('Two colours have the same name.')
      const variants = f.colours.length
        ? f.colours.map((c) => ({ color: c.color.trim(), hex: c.hex, sizes: f.sizes, images: c.images }))
        : f.sizes.length ? [{ color: NO_COLOUR, sizes: f.sizes, images: [] }] : []
      payload = {
        ...own, title: f.title.trim(), description: f.description.trim(), manual_price: Math.round(price * 100) / 100,
        images: f.photos, variants: variants as unknown as Json,
      }
    }

    setBusy(true)
    const { data, error } = isNew
      ? await supabase.from('products').insert({ ...payload, source: 'manual', title: f.title.trim(), category: f.category }).select('*').single()
      : await supabase.from('products').update(payload).eq('id', id!).select('*').single()
    setBusy(false)
    if (error) return fail(`Not saved: ${error.message}`)
    if (isNew) navigate(`/products/${data.id}`, { replace: true })
    setRow(data)
    say(isNew ? 'Product created' : 'Changes saved')
  }

  const remove = async () => {
    if (!row || !confirm(`Delete "${row.title}" for good?\n\nIts reviews are deleted too. Past orders keep their copy of the item.`)) return
    const { error } = await supabase.from('products').delete().eq('id', row.id)
    if (error) return setError(error.message)
    navigate('/products')
  }

  return (
    <>
      <Link to="/products" className="mb-3 inline-flex items-center gap-1 font-semibold text-olive hover:underline"><ChevronLeft className="size-5" aria-hidden /> All products</Link>
      <AdminTitle title={isNew ? 'Add my own product' : f.title}
        sub={isNew ? 'For anything you make or post yourself. Fill in the boxes and press Save.' : gelato ? 'Made in Gelato: name, colours, sizes and prices come from there.' : 'Your own product: you post it yourself when it sells.'}>
        {row && row.is_active && <a href={`${SHOP_URL}#/product/${row.id}`} target="_blank" rel="noopener noreferrer" className="btn-ghost">See it in the shop</a>}
        {row?.is_new && <button type="button" className="btn-dark" onClick={() => void supabase.from('products').update({ is_new: false }).eq('id', row.id).then(reloadRow)}><Check className="size-4" aria-hidden /> Photos are done</button>}
      </AdminTitle>
      {error && <div className="mb-5"><Alert>{error}</Alert></div>}

      {gelato && row && <div className="mb-8"><PhotoManager key={row.id} product={row} onChange={reloadRow} /></div>}
      {row && <div className="mb-8"><ModelManager key={row.id} product={row} onChange={reloadRow} /></div>}

      <form onSubmit={submit} className="grid gap-6 pb-24 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {!gelato && (
            <Section title="Photos" sub="The first photo is the main one. Use the arrows to change the order. Photos are made smaller for fast loading.">
              <PhotoPicker urls={f.photos} onChange={(u) => set('photos', u)} />
            </Section>
          )}

          <Section title="Details">
            <Field label="Name"><input className="input" required maxLength={200} disabled={gelato} value={f.title} placeholder="e.g. Hand-knitted baby blanket" onChange={(e) => set('title', e.target.value)} /></Field>
            <Field label="Description" hint={gelato ? undefined : 'What is it made of, how big is it, how to wash it.'}>
              <textarea className="input" rows={gelato ? 4 : 6} maxLength={5000} disabled={gelato} value={f.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            {!gelato && (
              <Field label="Price (US dollars)" hint="What the customer pays for one. Delivery is added at checkout.">
                <div className="relative max-w-56">
                  <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-muted">$</span>
                  <input className="input pl-8 text-lg font-semibold" inputMode="decimal" required placeholder="24.99" value={f.price} onChange={(e) => set('price', e.target.value.replace(/[^\d.,]/g, ''))} />
                </div>
              </Field>
            )}
          </Section>

          {!gelato && (
            <Section title="Sizes" sub="Leave empty if it comes in one size only.">
              <SizePicker sizes={f.sizes} onChange={(s) => set('sizes', s)} />
            </Section>
          )}

          {!gelato && (
            <Section title="Colours" sub="Only if customers can pick a colour. Each colour can have its own photos.">
              {f.colours.map((c, i) => (
                <div key={i} className="space-y-3 rounded-xl border border-line bg-canvas/40 p-4">
                  <div className="flex items-end gap-3">
                    <div className="flex-1"><Field label="Colour name"><input className="input" required maxLength={40} value={c.color} placeholder="e.g. Navy" onChange={(e) => setColour(i, { color: e.target.value })} /></Field></div>
                    <label className="shrink-0"><span className="mb-1.5 block text-[13px] font-semibold text-olive">Swatch</span>
                      <input type="color" className="h-11 w-14 cursor-pointer rounded-md border border-sand bg-white p-1" value={c.hex} onChange={(e) => setColour(i, { hex: e.target.value })} aria-label={`Swatch for ${c.color || 'this colour'}`} />
                    </label>
                    <button type="button" onClick={() => set('colours', f.colours.filter((_, j) => j !== i))} className="mb-0.5 rounded-lg p-3 text-red-700 hover:bg-red-50" aria-label={`Remove colour ${c.color}`}><Trash2 className="size-4" aria-hidden /></button>
                  </div>
                  <PhotoPicker small urls={c.images} onChange={(u) => setColour(i, { images: u })} label={`Photos of ${c.color || 'this colour'}`} />
                </div>
              ))}
              <button type="button" className="btn-ghost" onClick={() => set('colours', [...f.colours, { color: '', hex: '#cccccc', images: [] }])}><Plus className="size-4" aria-hidden /> Add a colour</button>
            </Section>
          )}
        </div>

        <div className="space-y-6">
          <Section title="Category" sub="Where it shows in the shop. Unisex shows under Men and Women.">
            <div className="grid grid-cols-2 gap-2">
              {ALL_CATEGORIES.map((c) => (
                <label key={c} className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2.5 font-semibold ${f.category === c ? 'border-orange bg-orange-soft/40 text-olive' : 'border-line hover:border-sand'}`}>
                  <input type="radio" name="category" className="accent-orange" checked={f.category === c} onChange={() => set('category', c)} /> {c}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Visibility">
            <label className="flex items-center justify-between gap-3"><span><strong className="block">Show in shop</strong><span className="text-sm text-muted">Off = hidden from customers</span></span><Toggle on={f.is_active} label="Show in shop" onChange={(v) => set('is_active', v)} /></label>
            <label className="flex items-center justify-between gap-3"><span><strong className="block">Bestseller</strong><span className="text-sm text-muted">Shown first on the home page</span></span><Toggle on={f.is_featured} label="Bestseller" onChange={(v) => set('is_featured', v)} /></label>
          </Section>

          {gelato && row && margin != null && (
            <Section title="Price" sub="Set in Gelato. Change it there and it updates here within 5 minutes.">
              <p className="text-2xl font-bold text-olive tabular-nums">from {formatMoney(fromPrice(row, margin))}</p>
            </Section>
          )}

          {gelato && (
            <details className="card p-5">
              <summary className="font-bold text-olive">Advanced: print files</summary>
              <p className="mt-2 text-sm text-muted">Leave empty to print the design saved in Gelato (normal). Only fill in to send a different PNG with each order.</p>
              <div className="mt-3 space-y-3">
                <Field label="Front design link"><input className="input" type="url" value={f.print_front} onChange={(e) => set('print_front', e.target.value)} /></Field>
                <Field label="Back design link"><input className="input" type="url" value={f.print_back} onChange={(e) => set('print_back', e.target.value)} /></Field>
              </div>
            </details>
          )}

          {row && !gelato && (
            <button type="button" onClick={remove} className="btn-ghost w-full text-red-700"><Trash2 className="size-4" aria-hidden /> Delete this product</button>
          )}
        </div>

        {/* always-visible save bar */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:left-[260px]">
          <div className="mx-auto flex max-w-[1200px] items-center justify-end gap-2">
            <Link to="/products" className="btn-ghost">Cancel</Link>
            <button className="btn-primary min-w-40" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Save product' : 'Save changes'}</button>
          </div>
        </div>
      </form>
      {toast}
    </>
  )
}

/** Photos: add by click or drop, reorder with arrows (or drag), first = main. Saved as WebP as soon as they are added. */
function PhotoPicker({ urls, onChange, small = false, label = 'Add photos' }: { urls: string[]; onChange: (u: string[]) => void; small?: boolean; label?: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)

  const add = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []).filter((x) => x.type.startsWith('image/'))
    if (!list.length) return setErr(files?.length ? 'Those are not pictures. Please choose JPG, PNG or WebP photos.' : null)
    setErr(null)
    const added: string[] = []
    for (const [n, file] of list.entries()) {
      setBusy(`Uploading ${n + 1} of ${list.length}…`)
      try { added.push(await storeImage('manual', file, 1600)) } catch { setErr(`"${file.name}" could not be read. Try another photo.`) }
    }
    onChange([...urls, ...added.filter((u) => !urls.includes(u))])
    setBusy(null)
  }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= urls.length) return
    const next = [...urls]
    next.splice(to, 0, next.splice(from, 1)[0])
    onChange(next)
  }

  return (
    <div>
      {urls.length > 0 && (
        <ul className={`mb-3 grid gap-3 ${small ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
          {urls.map((u, i) => (
            <li key={u} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag != null) move(drag, i); setDrag(null) }}
              className={`group relative overflow-hidden rounded-xl border-2 bg-cream-2 ${i === 0 && !small ? 'border-orange' : 'border-line'} ${drag === i ? 'opacity-50' : ''}`}>
              <div className="aspect-square">{imgSrc(u) && <img src={imgSrc(u)!} alt="" className="size-full object-cover" loading="lazy" />}</div>
              {i === 0 && !small && <span className="absolute top-2 left-2 rounded bg-orange px-2 py-0.5 text-xs font-bold text-white">Main photo</span>}
              <button type="button" onClick={() => onChange(urls.filter((_, j) => j !== i))} className="absolute top-2 right-2 rounded-full bg-white/95 p-1.5 shadow hover:text-red-700" aria-label="Remove photo"><X className="size-4" aria-hidden /></button>
              {urls.length > 1 && (
                <div className="absolute inset-x-2 bottom-2 flex justify-between">
                  <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="rounded-full bg-white/95 p-1.5 shadow disabled:opacity-0" aria-label="Move left"><ArrowLeft className="size-4" aria-hidden /></button>
                  <button type="button" onClick={() => move(i, i + 1)} disabled={i === urls.length - 1} className="rounded-full bg-white/95 p-1.5 shadow disabled:opacity-0" aria-label="Move right"><ArrowRight className="size-4" aria-hidden /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <label onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void add(e.dataTransfer.files) }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-center transition-colors ${small ? 'p-4' : 'p-8'} ${over ? 'border-orange bg-orange-soft/40' : 'border-sand bg-paper hover:border-orange'} ${busy ? 'pointer-events-none opacity-70' : ''}`}>
        <ImagePlus className={`${small ? 'size-6' : 'size-9'} text-orange`} aria-hidden />
        <span className="font-semibold text-olive" aria-live="polite">{busy ?? (urls.length ? 'Add more photos' : label)}</span>
        {!busy && !small && <span className="text-sm text-muted">Click here, or drag photos from your computer onto this box</span>}
        <input type="file" accept="image/*" multiple className="sr-only" disabled={!!busy} onChange={(e) => { void add(e.target.files); e.target.value = '' }} />
      </label>
      {err && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{err}</p>}
    </div>
  )
}

/** Tap sizes on and off; ready-made sets for clothing; type your own for anything else. */
function SizePicker({ sizes, onChange }: { sizes: string[]; onChange: (s: string[]) => void }) {
  const [custom, setCustom] = useState('')
  const toggle = (s: string) => onChange(sizes.includes(s) ? sizes.filter((x) => x !== s) : [...sizes, s])
  const addCustom = () => {
    const s = custom.trim().slice(0, 40)
    if (s && !sizes.includes(s)) onChange([...sizes, s])
    setCustom('')
  }
  const extra = sizes.filter((s) => !SIZE_SETS.some((set) => set.sizes.includes(s)))
  const chip = (s: string) => (
    <button key={s} type="button" onClick={() => toggle(s)} aria-pressed={sizes.includes(s)}
      className={`min-w-12 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-colors ${sizes.includes(s) ? 'border-olive bg-olive text-white' : 'border-line bg-paper hover:border-sand'}`}>{s}</button>
  )
  return (
    <div className="space-y-4">
      {SIZE_SETS.map((set) => (
        <div key={set.label}>
          <p className="mb-2 text-sm font-semibold text-muted">{set.label}</p>
          <div className="flex flex-wrap gap-2">{set.sizes.map(chip)}</div>
        </div>
      ))}
      <div>
        <p className="mb-2 text-sm font-semibold text-muted">Other sizes</p>
        <div className="flex flex-wrap items-center gap-2">
          {extra.map(chip)}
          <input className="input w-44 py-2" placeholder="e.g. 50 x 70 cm" value={custom} onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }} />
          <button type="button" onClick={addCustom} className="btn-ghost min-h-10 py-2"><Plus className="size-4" aria-hidden /> Add</button>
        </div>
      </div>
      {sizes.length > 0 && <p className="text-sm text-olive">Customers choose from: <strong>{sizes.join(', ')}</strong></p>}
    </div>
  )
}
