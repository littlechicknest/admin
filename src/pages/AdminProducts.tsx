import { Check, ChevronLeft, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PhotoManager, UploadButton } from '../components/Photos'
import { Alert, Field, Spinner, useTitle } from '../components/ui'
import type { Json, Tables } from '../lib/database.types'
import { asVariants, CATEGORIES, formatMoney, imgSrc, marginPrice, safeUrl, type Variant } from '../lib/shop'
import { supabase } from '../lib/supabase'
import { asPhotos, removeFiles, storeImage, type UploadResult } from '../lib/upload'
import { AdminTitle } from './AdminLayout'

type Row = Tables<'products'>

export function useMargin() {
  const [margin, setMargin] = useState<number | null>(null)
  useEffect(() => {
    supabase.from('store_settings').select('global_margin_percent').eq('id', 1).single()
      .then(({ data }) => setMargin(data?.global_margin_percent ?? 50))
  }, [])
  return margin
}

const shopPrice = (p: Row, margin: number) =>
  p.source === 'manual' ? Number(p.manual_price ?? 0) : marginPrice(Number(p.base_price ?? 0), margin)

export function AdminProducts() {
  useTitle('Products')
  const margin = useMargin()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<{ id: string; r: UploadResult } | null>(null)

  const reload = () =>
    supabase.from('products').select('*').order('is_new', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data, error }) => (error ? setError(error.message) : setRows(data)))
  useEffect(() => { void reload() }, [])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (rows ?? []).filter((p) => !t || p.title.toLowerCase().includes(t) || (p.external_product_id ?? '').toLowerCase().includes(t))
  }, [rows, q])

  const patch = async (id: string, change: Pick<Partial<Row>, 'is_active' | 'is_featured' | 'is_new'>) => {
    setRows((r) => r?.map((p) => (p.id === id ? { ...p, ...change } : p)) ?? null)
    const { error } = await supabase.from('products').update(change).eq('id', id)
    if (error) {
      setError(error.message)
      void reload() // roll the optimistic toggle back to what the database has
    }
  }

  const remove = async (p: Row) => {
    if (!confirm(`Delete "${p.title}"? Its reviews are deleted too. Past orders keep their copy of the item.`)) return
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) return setError(error.message)
    setRows((r) => r?.filter((x) => x.id !== p.id) ?? null)
    await removeFiles(asPhotos(p.photos).filter((x) => x.src !== 'gelato').map((x) => x.url))
  }

  const samples = (rows ?? []).filter((p) => p.is_sample).length
  const removeSamples = async () => {
    if (!confirm(`Delete all ${samples} sample products? Real products you added are not touched. Past test orders keep their copy of the items.`)) return
    const { error } = await supabase.from('products').delete().eq('is_sample', true)
    if (error) return setError(error.message)
    setRows((r) => r?.filter((x) => !x.is_sample) ?? null)
  }

  return (
    <>
      <AdminTitle title="Products">
        {samples > 0 && <button type="button" onClick={removeSamples} className="btn-ghost py-2 text-red-700"><Trash2 className="size-4" aria-hidden /> Delete {samples} sample products</button>}
        <Link to="/products/new" className="btn-primary py-2"><Plus className="size-4" aria-hidden /> Add product</Link>
      </AdminTitle>
      {(rows ?? []).some((p) => p.is_new) && (
        <details className="card mb-4 p-5" open>
          <summary className="text-lg font-bold text-olive">How to add photos to a NEW product</summary>
          <ol className="mt-3 list-decimal space-y-1 pl-6 text-base">
            <li>In Gelato, select the mockups you like and <strong>download</strong> them. You get a ZIP file.</li>
            <li>In Gelato, <strong>unselect</strong> them again and keep <strong>one</strong> mockup as main. Save.</li>
            <li>Here, press <strong>Upload ZIP</strong> on the product. Colours are found for you. Press <strong>Edit</strong> to check them.</li>
          </ol>
        </details>
      )}
      <label className="mb-4 block"><span className="sr-only">Search</span>
        <input className="input" type="search" placeholder="Search by title or Gelato id" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {!rows || margin == null ? <Spinner /> : filtered.length === 0 ? (
        <p className="card p-8 text-center text-muted">No products yet. They appear here after the first Gelato sync, or add one by hand.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((p) => {
            const variants = asVariants(p.variants)
            const img = imgSrc(variants.find((v) => v.images.length)?.images[0] ?? p.images[0])
            const missing = variants.filter((v) => !v.images.length).map((v) => v.color)
            const gelato = p.source === 'gelato'
            return (
              <li key={p.id} className={`card p-4 ${p.is_new ? 'border-2 border-orange' : ''} ${p.is_active ? '' : 'bg-cream-2/40'}`}>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-cream-2">{img && <img src={img} alt="" className="size-full object-cover" loading="lazy" />}</div>
                  <div className="min-w-60 flex-1">
                    <p className="text-base font-bold text-olive">
                      {p.is_new && <span className="mr-2 rounded bg-orange px-2 py-0.5 text-xs font-bold text-white">NEW</span>}
                      {p.title}
                      {p.is_sample && <span className="ml-2 rounded bg-yolk/25 px-1.5 py-0.5 text-xs font-semibold">Sample</span>}
                    </p>
                    <p className="text-sm text-muted">{p.category} · from {formatMoney(shopPrice(p, margin))}{gelato && ` (costs you ${formatMoney(p.base_price)})`}</p>
                    {variants.length > 0 && (
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                        {variants.map((v) => <span key={v.color} title={v.color} className={`size-4 rounded-full ring-1 ring-black/20 ${v.images.length ? '' : 'opacity-30'}`} style={{ background: v.hex ?? '#ccc' }} />)}
                        <span className={missing.length ? 'font-semibold text-red-700' : 'text-olive-3'}>{missing.length ? `No photo: ${missing.join(', ')}` : 'All colours have photos'}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 text-sm">
                    <span className="flex items-center justify-between gap-3">In shop <Toggle on={p.is_active} label={`Show ${p.title} in shop`} onChange={(v) => patch(p.id, { is_active: v })} /></span>
                    <span className="flex items-center justify-between gap-3">Bestseller <Toggle on={p.is_featured} label={`Feature ${p.title}`} onChange={(v) => patch(p.id, { is_featured: v })} /></span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {gelato && <UploadButton productId={p.id} onDone={(r) => { setUploaded({ id: p.id, r }); void reload() }} />}
                    <Link to={`/products/${p.id}`} className="btn-dark"><Pencil className="size-4" aria-hidden /> Edit</Link>
                    {p.is_new && <button type="button" onClick={() => patch(p.id, { is_new: false })} className="btn-ghost"><Check className="size-4" aria-hidden /> Done</button>}
                    {/* a deleted Gelato product would come back with the next sync: hide it instead */}
                    {!gelato && <button type="button" onClick={() => remove(p)} className="btn-ghost text-red-700" aria-label={`Delete ${p.title}`}><Trash2 className="size-4" aria-hidden /></button>}
                  </div>
                </div>
                {uploaded?.id === p.id && (
                  <div className="mt-3"><Alert tone={uploaded.r.problem ? 'error' : 'success'}>{uploaded.r.text} <Link to={`/products/${p.id}`} className="font-bold underline">See the pictures</Link></Alert></div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-leaf' : 'bg-sand'}`}>
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

/* ---------------------------------------------------------------- form */

type FormState = {
  source: 'gelato' | 'manual'
  title: string
  description: string
  category: string
  manual_price: string
  images: string[]
  variants: (Omit<Variant, 'sizes'> & { sizes: string })[]
  print_front: string
  print_back: string
  is_active: boolean
  is_featured: boolean
}

const EMPTY: FormState = {
  source: 'manual', title: '', description: '', category: 'Men',
  manual_price: '', images: [], variants: [], print_front: '', print_back: '', is_active: true, is_featured: false,
}

function ImageList({ urls, onChange, label }: { urls: string[]; onChange: (u: string[]) => void; label: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [url, setUrl] = useState('')

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setErr(null)
    try {
      const added: string[] = []
      for (const f of Array.from(files)) added.push(await storeImage('manual', f))
      onChange([...urls, ...added])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    }
    setBusy(false)
  }
  const addUrl = () => {
    if (!safeUrl(url.trim())) return setErr('Enter a full https:// image URL')
    onChange([...urls, url.trim()])
    setUrl('')
    setErr(null)
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-olive">{label}</p>
      <div className="flex flex-wrap gap-2">
        {urls.map((u, i) => (
          <div key={u + i} className="relative size-20 overflow-hidden rounded-lg bg-cream-2">
            {imgSrc(u) && <img src={imgSrc(u)!} alt="" className="size-full object-cover" />}
            <button type="button" onClick={() => onChange(urls.filter((_, j) => j !== i))} className="absolute top-1 right-1 rounded-full bg-white/90 p-0.5" aria-label="Remove image"><X className="size-3.5" aria-hidden /></button>
          </div>
        ))}
        <label className="grid size-20 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-sand text-muted hover:border-olive-3">
          {busy ? <span className="text-xs">Uploading…</span> : <ImagePlus className="size-6" aria-hidden />}
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void onFiles(e.target.files); e.target.value = '' }} aria-label={`Upload ${label}`} />
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <input className="input py-1.5 text-sm" placeholder="…or paste an image URL (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="button" onClick={addUrl} className="btn-ghost shrink-0 py-1.5">Add</button>
      </div>
      {err && <p role="alert" className="mt-1 text-sm text-red-700">{err}</p>}
    </div>
  )
}

export function ProductForm() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  useTitle(isNew ? 'Add product' : 'Edit product')
  const navigate = useNavigate()
  const [f, setF] = useState<FormState | null>(isNew ? EMPTY : null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [row, setRow] = useState<Row | null>(null)
  const reloadRow = async () => {
    const { data } = await supabase.from('products').select('*').eq('id', id!).single()
    if (data) setRow(data)
  }

  useEffect(() => {
    if (isNew) return
    supabase.from('products').select('*').eq('id', id!).maybeSingle().then(({ data, error }) => {
      if (error || !data) return setError('Product not found.')
      setRow(data)
      const pf = (data.print_files ?? {}) as Record<string, string>
      setF({
        source: data.source as FormState['source'], title: data.title,
        description: data.description, category: data.category,
        manual_price: data.manual_price?.toString() ?? '', images: data.images,
        variants: asVariants(data.variants).map((v) => ({ ...v, sizes: v.sizes.join(', ') })),
        print_front: pf.front ?? '', print_back: pf.back ?? '', is_active: data.is_active, is_featured: data.is_featured,
      })
    })
  }, [id, isNew])

  if (!f) return error ? <Alert>{error}</Alert> : <Spinner />
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => (s ? { ...s, [k]: v } : s))
  const setVariant = (i: number, change: Partial<FormState['variants'][0]>) =>
    set('variants', f.variants.map((v, j) => (j === i ? { ...v, ...change } : v)))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const gelato = f.source === 'gelato'
    const manual = Number(f.manual_price)
    if (!gelato && (f.manual_price === '' || !(manual >= 0))) return setError('Manual products need a price.')
    for (const u of [f.print_front, f.print_back]) if (u && !safeUrl(u)) return setError('Print file links must be full https:// URLs.')
    const names = f.variants.map((v) => v.color.trim().toLowerCase())
    if (names.some((n) => !n)) return setError('Every colour needs a name.')
    if (new Set(names).size !== names.length) return setError('Colour names must be unique.')

    const own = { // only the shop decides these; everything else on a Gelato product comes from the sync
      category: f.category,
      print_files: { ...(f.print_front && { front: f.print_front }), ...(f.print_back && { back: f.print_back }) },
      is_active: f.is_active,
      is_featured: f.is_featured,
    }
    const payload = gelato ? own : {
      ...own,
      title: f.title.trim(),
      description: f.description.trim(),
      manual_price: Math.round(manual * 100) / 100,
      images: f.images,
      variants: f.variants.map((v) => ({
        color: v.color.trim(), ...(v.hex && { hex: v.hex }),
        sizes: v.sizes.split(',').map((s) => s.trim()).filter(Boolean), images: v.images,
      })) as unknown as Json,
    }
    setBusy(true)
    const { error } = isNew
      ? await supabase.from('products').insert({ ...payload, source: 'manual', title: f.title.trim() })
      : await supabase.from('products').update(payload).eq('id', id!)
    setBusy(false)
    if (error) return setError(error.message)
    navigate('/products')
  }

  const isGelato = f.source === 'gelato'

  return (
    <>
      <Link to="/products" className="mb-4 inline-flex items-center gap-1 text-base font-bold text-olive hover:underline"><ChevronLeft className="size-5" aria-hidden /> Products</Link>
      <AdminTitle title={isNew ? 'Add product' : f.title}>
        {row?.is_new && <button type="button" className="btn-dark" onClick={() => void supabase.from('products').update({ is_new: false }).eq('id', row.id).then(reloadRow)}><Check className="size-4" aria-hidden /> Photos are done</button>}
      </AdminTitle>
      {isGelato && row && <div className="mb-8"><PhotoManager key={row.id} product={row} onChange={reloadRow} /></div>}
      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="card space-y-4 p-5">
            <p className="rounded-lg bg-cream-2/70 p-3 text-sm text-muted">{isGelato
              ? 'Title, description, colours, sizes and cost come from Gelato and update automatically. Change them in Gelato.'
              : 'Manual product: you set a fixed price and fulfil it yourself. Gelato products are added by the sync.'}</p>
            <Field label="Title"><input className="input" required maxLength={200} disabled={isGelato} value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
            <Field label="Description"><textarea className="input" rows={5} maxLength={5000} disabled={isGelato} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <select className="input" value={f.category} onChange={(e) => set('category', e.target.value)}>{[...CATEGORIES, 'Unisex'].map((c) => <option key={c}>{c}</option>)}</select>
              </Field>
              {!isGelato && <Field label="Price (USD)"><input className="input" type="number" min="0" step="0.01" value={f.manual_price} onChange={(e) => set('manual_price', e.target.value)} /></Field>}
            </div>
          </section>

          {!isGelato && <><section className="card space-y-4 p-5">
            <ImageList label="Product images" urls={f.images} onChange={(u) => set('images', u)} />
          </section>

          <section className="card space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl">Colours & sizes</h2>
              <button type="button" className="btn-ghost py-2" onClick={() => set('variants', [...f.variants, { color: '', hex: '#3b4228', sizes: 'S, M, L, XL', images: [] }])}><Plus className="size-4" aria-hidden /> Add colour</button>
            </div>
            {f.variants.length === 0 && <p className="text-sm text-muted">No colours: the product is sold as a single option.</p>}
            {f.variants.map((v, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-sand p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_80px_auto]">
                  <Field label="Colour name"><input className="input" required maxLength={40} value={v.color} onChange={(e) => setVariant(i, { color: e.target.value })} /></Field>
                  <Field label="Swatch"><input type="color" className="h-[46px] w-full cursor-pointer rounded-lg border border-sand bg-white p-1" value={v.hex ?? '#cccccc'} onChange={(e) => setVariant(i, { hex: e.target.value })} /></Field>
                  <button type="button" onClick={() => set('variants', f.variants.filter((_, j) => j !== i))} className="self-start rounded p-2 text-red-700 hover:bg-red-50 sm:mt-7" aria-label={`Remove colour ${v.color}`}><Trash2 className="size-4" aria-hidden /></button>
                </div>
                <Field label="Sizes" hint="Comma separated, e.g. S, M, L, XL. Leave empty for one-size."><input className="input" value={v.sizes} onChange={(e) => setVariant(i, { sizes: e.target.value })} /></Field>
                <ImageList label={`Images for ${v.color || 'this colour'}`} urls={v.images} onChange={(u) => setVariant(i, { images: u })} />
              </div>
            ))}
          </section></>}
        </div>

        <div className="space-y-6">
          <section className="card space-y-4 p-5">
            <h2 className="text-xl">Visibility</h2>
            <label className="flex items-center justify-between gap-3"><span className="text-sm font-bold">Show in shop</span><Toggle on={f.is_active} label="Show in shop" onChange={(v) => set('is_active', v)} /></label>
            <label className="flex items-center justify-between gap-3"><span className="text-sm font-bold">Featured on home page</span><Toggle on={f.is_featured} label="Featured" onChange={(v) => set('is_featured', v)} /></label>
          </section>
          {isGelato && (
            <section className="card space-y-4 p-5">
              <h2 className="text-xl">Print files</h2>
              <p className="text-xs text-muted">Optional. Leave empty to print the design saved in Gelato. Filled in, these PNG links are sent with each order instead. Never shown to customers.</p>
              <Field label="Front design URL"><input className="input" type="url" value={f.print_front} onChange={(e) => set('print_front', e.target.value)} /></Field>
              <Field label="Back design URL"><input className="input" type="url" value={f.print_back} onChange={(e) => set('print_back', e.target.value)} /></Field>
            </section>
          )}
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create product' : 'Save changes'}</button>
            <Link to="/products" className="btn-ghost">Cancel</Link>
          </div>
        </div>
      </form>
    </>
  )
}
