import { Check, Eye, EyeOff, ImageOff, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { UploadButton } from '../components/Photos'
import { Alert, Spinner, useTitle, useToast } from '../components/ui'
import type { Tables } from '../lib/database.types'
import { ALL_CATEGORIES, asVariants, formatMoney, fromPrice, imgSrc } from '../lib/shop'
import { supabase } from '../lib/supabase'
import { asPhotos, removeFiles } from '../lib/upload'
import { AdminTitle } from './AdminLayout'

type Row = Tables<'products'>
type Change = Pick<Partial<Row>, 'is_active' | 'is_featured' | 'is_new' | 'category'>

export function useMargin() {
  const [margin, setMargin] = useState<number | null>(null)
  useEffect(() => {
    supabase.from('store_settings').select('global_margin_percent').eq('id', 1).single()
      .then(({ data }) => setMargin(data?.global_margin_percent ?? 50))
  }, [])
  return margin
}

/** Colours with no photo. Own products' general photos show for every colour, so those only need one photo somewhere. */
const missingPhotos = (p: Row) => {
  const v = asVariants(p.variants)
  if (p.source === 'manual') return p.images.length || v.some((x) => x.images.length) ? [] : ['all']
  return v.length ? v.filter((x) => !x.images.length).map((x) => x.color) : p.images.length ? [] : ['all']
}

const TABS = {
  all: { label: 'All', test: () => true },
  live: { label: 'In shop', test: (p: Row) => p.is_active },
  hidden: { label: 'Hidden', test: (p: Row) => !p.is_active },
  photos: { label: 'Need photos', test: (p: Row) => p.is_new || missingPhotos(p).length > 0 },
  own: { label: 'My own products', test: (p: Row) => p.source === 'manual' && !p.is_sample },
} satisfies Record<string, { label: string; test: (p: Row) => boolean }>
type Tab = keyof typeof TABS

export function AdminProducts() {
  useTitle('Products')
  const margin = useMargin()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [cat, setCat] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [toast, say] = useToast()

  const reload = () =>
    supabase.from('products').select('*').order('is_new', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data, error }) => (error ? setError(error.message) : setRows(data)))
  useEffect(() => { void reload() }, [])

  const visible = useMemo(() => (rows ?? []).filter((p) => !p.is_sample || tab === 'all' || tab === 'hidden'), [rows, tab])
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return visible.filter((p) => TABS[tab].test(p) && (!cat || p.category === cat)
      && (!t || p.title.toLowerCase().includes(t) || (p.external_product_id ?? '').toLowerCase().includes(t)))
  }, [visible, tab, cat, q])

  /** Saves at once and shows "Saved"; puts things back if the database said no. */
  const patch = async (ids: string[], change: Change, done = 'Saved') => {
    setRows((r) => r?.map((p) => (ids.includes(p.id) ? { ...p, ...change } : p)) ?? null)
    const { error } = await supabase.from('products').update(change).in('id', ids)
    if (error) {
      say(`Not saved: ${error.message}`, true)
      void reload()
    } else say(done)
  }

  const remove = async (p: Row) => {
    if (!confirm(`Delete "${p.title}" for good?\n\nIts reviews are deleted too. Past orders keep their copy of the item.`)) return
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) return say(error.message, true)
    setRows((r) => r?.filter((x) => x.id !== p.id) ?? null)
    say('Product deleted')
    // pictures are named by their content, so another product may use the same file: keep those
    const others = JSON.stringify((rows ?? []).filter((x) => x.id !== p.id).map((x) => [x.images, x.variants, x.photos]))
    await removeFiles([...p.images, ...asVariants(p.variants).flatMap((v) => v.images), ...asPhotos(p.photos).map((x) => x.url)]
      .filter((u) => u.includes('/manual/') && !others.includes(u)))
  }

  const samples = (rows ?? []).filter((p) => p.is_sample).length
  const removeSamples = async () => {
    if (!confirm(`Delete all ${samples} sample products? Products you added and Gelato products are not touched.`)) return
    const { error } = await supabase.from('products').delete().eq('is_sample', true)
    if (error) return say(error.message, true)
    setRows((r) => r?.filter((x) => !x.is_sample) ?? null)
    say('Sample products deleted')
  }

  const ids = [...picked].filter((id) => filtered.some((p) => p.id === id))
  const allPicked = filtered.length > 0 && filtered.every((p) => picked.has(p.id))
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const bulk = async (change: Change, text: string) => { await patch(ids, change, text); setPicked(new Set()) }

  const count = (t: Tab) => visible.filter(TABS[t].test).length

  return (
    <>
      <AdminTitle title="Products" sub="Gelato products appear here by themselves. You can also add your own.">
        {samples > 0 && <button type="button" onClick={removeSamples} className="btn-ghost text-red-700"><Trash2 className="size-4" aria-hidden /> Delete sample products ({samples})</button>}
        <Link to="/products/new" className="btn-primary"><Plus className="size-4" aria-hidden /> Add my own product</Link>
      </AdminTitle>

      {(rows ?? []).some((p) => p.is_new) && (
        <details className="card mb-5 border-orange/40 bg-orange-soft/30 p-5">
          <summary className="font-bold text-olive">New Gelato products need photos. How?</summary>
          <ol className="mt-3 list-decimal space-y-1 pl-6">
            <li>In Gelato, select the mockups you like and <strong>download</strong> them. You get a ZIP file.</li>
            <li>In Gelato, <strong>unselect</strong> them again and keep <strong>one</strong> mockup as main. Save.</li>
            <li>Here, press <strong>Add ZIP or pictures</strong> on the product. Colours are found for you. Press <strong>Edit</strong> to check them.</li>
          </ol>
        </details>
      )}

      <div className="card overflow-hidden">
        {/* tabs */}
        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-3 pt-2" role="tablist" aria-label="Show">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setPicked(new Set()) }}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[15px] font-semibold ${tab === t ? 'border-orange text-olive' : 'border-transparent text-muted hover:text-olive'}`}>
              {TABS[t].label} <span className="ml-1 rounded-full bg-cream-2 px-2 py-0.5 text-xs">{rows ? count(t) : '…'}</span>
            </button>
          ))}
        </div>

        {/* search + category */}
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row">
          <label className="relative flex-1"><span className="sr-only">Search products</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input pl-9" type="search" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="sm:w-52"><span className="sr-only">Category</span>
            <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All categories</option>
              {ALL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>

        {/* bulk actions */}
        {ids.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-olive px-4 py-3 text-white">
            <strong className="mr-2">{ids.length} selected</strong>
            <label className="flex items-center gap-2 text-sm">Move to
              <select className="input w-auto bg-white py-1.5 text-ink" value="" onChange={(e) => void bulk({ category: e.target.value }, `Moved to ${e.target.value}`)}>
                <option value="" disabled>category…</option>
                {ALL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void bulk({ is_active: true }, 'Now in the shop')} className="btn min-h-9 bg-white/15 py-1.5 hover:bg-white/25"><Eye className="size-4" aria-hidden /> Show in shop</button>
            <button type="button" onClick={() => void bulk({ is_active: false }, 'Hidden from the shop')} className="btn min-h-9 bg-white/15 py-1.5 hover:bg-white/25"><EyeOff className="size-4" aria-hidden /> Hide</button>
            <button type="button" onClick={() => setPicked(new Set())} className="ml-auto rounded-lg p-2 hover:bg-white/15" aria-label="Clear selection"><X className="size-4" aria-hidden /></button>
          </div>
        )}

        {error && <div className="p-4"><Alert>{error}</Alert></div>}
        {!rows || margin == null ? <Spinner /> : filtered.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-lg font-semibold text-olive">Nothing here</p>
            <p className="mt-1 text-muted">{q || cat ? 'Try another search or category.' : tab === 'own' ? 'Products you add yourself show up here.' : 'No products in this list.'}</p>
            {tab === 'own' && <Link to="/products/new" className="btn-primary mt-4"><Plus className="size-4" aria-hidden /> Add my own product</Link>}
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[28px_64px_1fr_160px_110px_80px_150px] items-center gap-4 border-b border-line bg-canvas/60 px-4 py-2 text-xs font-bold tracking-wide text-muted uppercase md:grid">
              <input type="checkbox" className="size-4 accent-orange" checked={allPicked} aria-label="Select all"
                onChange={() => setPicked(allPicked ? new Set() : new Set(filtered.map((p) => p.id)))} />
              <span>Photo</span><span>Product</span><span>Category</span><span>Price</span><span>In shop</span><span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-line">
              {filtered.map((p) => {
                const variants = asVariants(p.variants)
                const img = imgSrc(variants.find((v) => v.images.length)?.images[0] ?? p.images[0])
                const missing = missingPhotos(p)
                const gelato = p.source === 'gelato'
                return (
                  <li key={p.id} className={`grid grid-cols-[28px_64px_1fr] items-center gap-x-4 gap-y-3 px-4 py-3 md:grid-cols-[28px_64px_1fr_160px_110px_80px_150px] ${picked.has(p.id) ? 'bg-orange-soft/30' : p.is_active ? '' : 'bg-canvas/50'}`}>
                    <input type="checkbox" className="size-4 accent-orange" checked={picked.has(p.id)} onChange={() => togglePick(p.id)} aria-label={`Select ${p.title}`} />
                    <Link to={`/products/${p.id}`} className="grid size-16 place-items-center overflow-hidden rounded-lg bg-cream-2" tabIndex={-1}>
                      {img ? <img src={img} alt="" className="size-full object-cover" loading="lazy" decoding="async" /> : <ImageOff className="size-5 text-muted" aria-hidden />}
                    </Link>
                    <div className="min-w-0">
                      <Link to={`/products/${p.id}`} className="block truncate font-semibold text-olive hover:underline">{p.title}</Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        {p.is_new && <span className="rounded bg-orange px-1.5 py-0.5 font-bold text-white">NEW</span>}
                        <span className={`rounded px-1.5 py-0.5 font-semibold ${gelato ? 'bg-[#e8f1fb] text-[#1f4f86]' : 'bg-[#eef6e6] text-olive'}`}>{gelato ? 'Gelato' : p.is_sample ? 'Sample' : 'My own'}</span>
                        {p.is_featured && <span className="rounded bg-yolk/25 px-1.5 py-0.5 font-semibold text-olive">Bestseller</span>}
                        {missing.length > 0 && <span className="font-semibold text-red-700">{missing[0] === 'all' ? 'No photo' : `No photo: ${missing.join(', ')}`}</span>}
                      </p>
                    </div>
                    {/* on phones these sit on a second row */}
                    <div className="col-span-3 flex flex-wrap items-center gap-3 md:contents">
                      <label className="min-w-36 flex-1 md:flex-none"><span className="sr-only">Category of {p.title}</span>
                        <select className="input min-h-10 py-1.5 text-sm" value={p.category} onChange={(e) => void patch([p.id], { category: e.target.value }, `Moved to ${e.target.value}`)}>
                          {ALL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </label>
                      <span className="font-semibold tabular-nums">{gelato && 'from '}{formatMoney(fromPrice(p, margin))}</span>
                      <span className="flex items-center gap-2"><Toggle on={p.is_active} label={`Show ${p.title} in shop`} onChange={(v) => void patch([p.id], { is_active: v }, v ? 'Now in the shop' : 'Hidden from the shop')} /><span className="text-sm text-muted md:hidden">In shop</span></span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <Link to={`/products/${p.id}`} className="btn-ghost min-h-10 px-3"><Pencil className="size-4" aria-hidden /> Edit</Link>
                        {/* a deleted Gelato product would come back with the next sync: hide it instead */}
                        {!gelato && <button type="button" onClick={() => remove(p)} className="rounded-lg p-2.5 text-red-700 hover:bg-red-50" aria-label={`Delete ${p.title}`}><Trash2 className="size-4" aria-hidden /></button>}
                      </div>
                    </div>
                    {p.is_new && (
                      <div className="col-span-3 flex flex-wrap items-center gap-2 rounded-lg bg-orange-soft/40 p-2 md:col-span-7 md:ml-[108px]">
                        {gelato && <UploadButton productId={p.id} onDone={(r) => { say(r.text, r.problem); void reload() }} />}
                        <button type="button" onClick={() => void patch([p.id], { is_new: false }, 'Marked as done')} className="btn-ghost"><Check className="size-4" aria-hidden /> Photos are done</button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
      {toast}
    </>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-leaf' : 'bg-sand'}`}>
      <span className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}
