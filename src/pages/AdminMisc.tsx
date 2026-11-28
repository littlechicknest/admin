import { Check, Download, EyeOff, Mail, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Alert, Field, Spinner, Stars, useTitle } from '../components/ui'
import type { Json, Tables } from '../lib/database.types'
import { formatDate, formatMoney, marginPrice, SHOP_URL } from '../lib/shop'
import { csvCell } from '../lib/csv'
import { COUNTRIES, countryName, fromForm, toForm, type ZoneForm } from '../lib/zones'
import { functionError, supabase } from '../lib/supabase'
import { AdminTitle } from './AdminLayout'

/* ------------------------------------------------------------ reviews */

type ReviewRow = Tables<'reviews'> & { products: { title: string } | null }

export function AdminReviews() {
  useTitle('Reviews')
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('reviews').select('*, products(title)').order('is_approved').order('created_at', { ascending: false }).limit(200)
      .then(({ data, error }) => (error ? setError(error.message) : setRows(data as unknown as ReviewRow[])))
  }, [])

  const setApproved = async (r: ReviewRow, is_approved: boolean) => {
    const { error } = await supabase.from('reviews').update({ is_approved }).eq('id', r.id)
    if (error) return setError(error.message)
    setRows((rs) => rs?.map((x) => (x.id === r.id ? { ...x, is_approved } : x)) ?? null)
  }
  const remove = async (r: ReviewRow) => {
    if (!confirm('Delete this review?')) return
    const { error } = await supabase.from('reviews').delete().eq('id', r.id)
    if (error) return setError(error.message)
    setRows((rs) => rs?.filter((x) => x.id !== r.id) ?? null)
  }

  return (
    <>
      <AdminTitle title="Reviews" sub="New reviews wait here until you approve them." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {!rows ? <Spinner /> : rows.length === 0 ? <p className="card p-8 text-center text-muted">No reviews yet.</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className={`card p-5 ${r.is_approved ? '' : 'border-yolk'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} />
                    {!r.is_approved && <span className="rounded-full bg-yolk/25 px-2 py-0.5 text-xs font-extrabold uppercase text-olive">Pending</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted">{r.author_name} on <a href={`${SHOP_URL}#/product/${r.product_id}`} target="_blank" rel="noopener noreferrer" className="underline">{r.products?.title ?? 'product'}</a> · {formatDate(r.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  {r.is_approved
                    ? <button type="button" onClick={() => setApproved(r, false)} className="btn-ghost py-1.5"><EyeOff className="size-4" aria-hidden /> Hide</button>
                    : <button type="button" onClick={() => setApproved(r, true)} className="btn-dark py-1.5"><Check className="size-4" aria-hidden /> Approve</button>}
                  <button type="button" onClick={() => remove(r)} className="rounded p-2 text-red-700 hover:bg-red-50" aria-label="Delete review"><Trash2 className="size-4" aria-hidden /></button>
                </div>
              </div>
              {r.body && <p className="mt-3 whitespace-pre-line text-ink/85">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/* ------------------------------------------------------------ messages */

export function AdminMessages() {
  useTitle('Messages')
  const [rows, setRows] = useState<Tables<'contact_messages'>[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200)
      .then(({ data, error }) => (error ? setError(error.message) : setRows(data)))
  }, [])

  const markRead = async (id: string, is_read: boolean) => {
    const { error } = await supabase.from('contact_messages').update({ is_read }).eq('id', id)
    if (error) return setError(error.message)
    setRows((rs) => rs?.map((x) => (x.id === id ? { ...x, is_read } : x)) ?? null)
  }
  const remove = async (id: string) => {
    if (!confirm('Delete this message?')) return
    const { error } = await supabase.from('contact_messages').delete().eq('id', id)
    if (error) return setError(error.message)
    setRows((rs) => rs?.filter((x) => x.id !== id) ?? null)
  }

  return (
    <>
      <AdminTitle title="Messages" sub="What people sent through the contact form." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {!rows ? <Spinner /> : rows.length === 0 ? <p className="card p-8 text-center text-muted">No messages yet.</p> : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className={`card p-5 ${m.is_read ? 'opacity-75' : 'border-yolk'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-olive">{m.name} {!m.is_read && <span className="ml-1 rounded-full bg-yolk/25 px-2 py-0.5 text-xs font-extrabold uppercase">New</span>}</p>
                  <p className="text-sm break-all text-muted">{m.email} · {new Date(m.created_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <a href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent('Re: your message to Little Chick Nest')}`} onClick={() => !m.is_read && markRead(m.id, true)} className="btn-dark py-1.5"><Mail className="size-4" aria-hidden /> Reply</a>
                  <button type="button" onClick={() => markRead(m.id, !m.is_read)} className="btn-ghost py-1.5">{m.is_read ? 'Mark unread' : 'Mark read'}</button>
                  <button type="button" onClick={() => remove(m.id)} className="rounded p-2 text-red-700 hover:bg-red-50" aria-label="Delete message"><Trash2 className="size-4" aria-hidden /></button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-ink/85">{m.message}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/* ------------------------------------------------------------ customers */

/** The API returns at most 1000 rows at a time. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (;;) {
    const { data, error } = await page(out.length, out.length + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if ((data?.length ?? 0) < 1000) return out
  }
}

function downloadCsv(name: string, rows: string[][]) {
  const blob = new Blob(['\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${name}-${new Date().toISOString().slice(0, 10)}.csv` })
  a.click()
  URL.revokeObjectURL(a.href)
}

export function AdminCustomers() {
  useTitle('Customers')
  const [rows, setRows] = useState<Tables<'profiles'>[] | null>(null)
  const [subs, setSubs] = useState<Tables<'newsletter_subscribers'>[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetchAll((a, b) => supabase.from('profiles').select('*').order('created_at', { ascending: false }).order('id').range(a, b)),
      fetchAll((a, b) => supabase.from('newsletter_subscribers').select('*').order('created_at', { ascending: false }).order('email').range(a, b)),
    ]).then(([p, n]) => { setRows(p); setSubs(n) }, (e: Error) => setError(e.message))
  }, [])

  const t = q.trim().toLowerCase()
  const list = (rows ?? []).filter((r) => !t || (r.email ?? '').toLowerCase().includes(t) || (r.full_name ?? '').toLowerCase().includes(t))
  const day = (iso: string) => iso.slice(0, 10)
  const saveCustomers = () => downloadCsv('shop-customers', [['Email', 'Name', 'Joined'], ...(rows ?? []).filter((r) => r.email && r.role !== 'admin').map((r) => [r.email!, r.full_name ?? '', day(r.created_at)])])
  const saveNewsletter = () => downloadCsv('newsletter-emails', [['Email', 'Joined'], ...subs.map((r) => [r.email, day(r.created_at)])])

  return (
    <>
      <AdminTitle title="Customers" sub="Everyone who made an account in the shop.">
        <button type="button" onClick={saveCustomers} disabled={!rows?.length} className="btn-primary"><Download className="size-4" aria-hidden /> Download customer emails (CSV)</button>
        <button type="button" onClick={saveNewsletter} disabled={!subs.length} className="btn-dark"><Download className="size-4" aria-hidden /> Download {subs.length} newsletter emails (CSV)</button>
      </AdminTitle>
      <label className="mb-4 block"><span className="sr-only">Search</span>
        <input className="input" type="search" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {error && <Alert>{error}</Alert>}
      {!rows ? !error && <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-sand text-xs uppercase tracking-wide text-muted"><tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Joined</th><th className="p-3">Role</th></tr></thead>
            <tbody className="divide-y divide-sand">
              {list.map((r) => (
                <tr key={r.id}><td className="p-3">{r.full_name || '—'}</td><td className="p-3 break-all">{r.email}</td><td className="p-3 whitespace-nowrap">{formatDate(r.created_at)}</td><td className="p-3 capitalize">{r.role}</td></tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="p-6 text-center text-muted">No customers found.</p>}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------ settings */

export function AdminSettings() {
  useTitle('Settings')
  const [s, setS] = useState<Tables<'store_settings'> | null>(null)
  const [margin, setMargin] = useState(50)
  const [zones, setZones] = useState<ZoneForm[]>([])
  const [mode, setMode] = useState<'test' | 'live'>('test')
  const [unisex, setUnisex] = useState(true)
  const [example, setExample] = useState('15')
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('admin_webhook_token').then(({ data }) => setToken(data ?? null))
    supabase.from('store_settings').select('*').eq('id', 1).single().then(({ data }) => {
      if (!data) return
      setS(data)
      setMargin(data.global_margin_percent)
      setZones(toForm(data.shipping_zones))
      setMode(data.checkout_mode === 'live' ? 'live' : 'test')
      setUnisex(data.show_unisex)
    })
  }, [])

  if (!s) return <Spinner />

  const save = async () => {
    const checked = fromForm(zones)
    if ('problem' in checked) return setMsg({ tone: 'error', text: checked.problem })
    const { data, error } = await supabase.from('store_settings')
      .update({ global_margin_percent: margin, shipping_zones: checked.zones as unknown as Json, checkout_mode: mode, show_unisex: unisex }).eq('id', 1).select().single()
    if (error) return setMsg({ tone: 'error', text: error.message })
    setS(data)
    setZones(toForm(data.shipping_zones))
    setMsg({ tone: 'success', text: 'Saved. Shop prices updated instantly.' })
  }

  const sync = async (fn: 'sync-products' | 'sync-order-status') => {
    setSyncing(fn)
    setMsg(null)
    const { data, error } = await supabase.functions.invoke<{ message: string }>(fn, { body: {} })
    setSyncing(null)
    setMsg(error ? { tone: 'error', text: await functionError(error) } : { tone: 'success', text: data?.message ?? 'Sync complete.' })
  }

  const base = Math.max(0, Number(example) || 0)
  const dirty = margin !== s.global_margin_percent || JSON.stringify(zones) !== JSON.stringify(toForm(s.shipping_zones)) || mode !== s.checkout_mode || unisex !== s.show_unisex
  const setZone = (i: number, patch: Partial<ZoneForm>) => setZones((list) => list.map((z, n) => (n === i ? { ...z, ...patch } : z)))
  const unplaced = COUNTRIES.filter(([c]) => !zones.some((z) => z.countries.includes(c)))

  return (
    <>
      <AdminTitle title="Settings" sub="Prices, delivery, payments and the Gelato connection." />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card space-y-5 p-6">
          <div>
            <h2 className="text-xl">Shop prices</h2>
            <p className="text-sm text-muted">Gelato products sell at the price you set in Gelato. This percentage is only used for a Gelato product that has no price set there: shop price = what Gelato charges you + this percentage. Your own products use the price you type on the product.</p>
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="margin" className="text-sm font-bold text-olive">Margin</label>
              <output htmlFor="margin" className="font-display text-4xl text-orange tabular-nums">{margin}%</output>
            </div>
            <input id="margin" type="range" min={1} max={100} value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="w-full accent-orange" />
            <div className="flex justify-between text-xs text-muted"><span>1%</span><span>50%</span><span>100%</span></div>
          </div>
          <div className="rounded-lg bg-cream-2/70 p-4">
            <p className="mb-2 text-sm font-bold text-olive">Live preview</p>
            <div className="flex flex-wrap items-center gap-2 text-lg">
              <label className="flex items-center gap-1"><span className="sr-only">Example base cost</span>$<input type="number" min="0" step="0.01" value={example} onChange={(e) => setExample(e.target.value)} className="input w-24 py-1" /></label>
              <span className="text-muted">cost →</span>
              <strong className="text-2xl text-olive tabular-nums">{formatMoney(marginPrice(base, margin))}</strong>
              <span className="text-sm text-muted">in shop (profit {formatMoney(marginPrice(base, margin) - base)})</span>
            </div>
          </div>
          <div>
            <h3 className="text-lg">Delivery prices</h3>
            <p className="text-sm text-muted">Delivery is never free. Customers pay the price of the group their country is in (further away = more), plus “each extra item” for every item after the first. It is added to the card payment on Stripe. Prices in USD.</p>
            <ul className="mt-3 space-y-3">
              {zones.map((z, i) => (
                <li key={i} className="rounded-lg border border-line p-4">
                  <input className="input mb-3 font-semibold" aria-label="Group name" value={z.name} maxLength={60} onChange={(e) => setZone(i, { name: e.target.value })} />
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Standard"><input type="number" min="0.01" step="0.01" className="input" value={z.standard} onChange={(e) => setZone(i, { standard: e.target.value })} /></Field>
                    <Field label="Express"><input type="number" min="0.01" step="0.01" className="input" value={z.express} onChange={(e) => setZone(i, { express: e.target.value })} /></Field>
                    <Field label="Each extra item"><input type="number" min="0" step="0.01" className="input" value={z.extra} onChange={(e) => setZone(i, { extra: e.target.value })} /></Field>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {z.countries.map((c) => (
                      <span key={c} className="flex items-center gap-1 rounded-full bg-cream-2 py-1 pr-1 pl-3 text-sm text-olive">{countryName(c)}
                        <button type="button" aria-label={`Remove ${countryName(c)}`} onClick={() => setZone(i, { countries: z.countries.filter((x) => x !== c) })} className="grid size-6 place-items-center rounded-full hover:bg-sand"><X className="size-3.5" aria-hidden /></button>
                      </span>
                    ))}
                    {unplaced.length > 0 && (
                      <select className="input w-auto py-1.5 text-sm" value="" aria-label="Add a country" onChange={(e) => setZone(i, { countries: [...z.countries, e.target.value] })}>
                        <option value="" disabled>+ Add country</option>
                        {unplaced.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                      </select>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {unplaced.length > 0 && <p className="mt-2 text-sm text-red-700">Not delivered to (customers there can’t check out): {unplaced.map(([, n]) => n).join(', ')}</p>}
          </div>
          <fieldset className="rounded-lg border border-line p-4">
            <legend className="px-1 text-sm font-bold text-olive">Unisex category</legend>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" checked={unisex} onChange={(e) => setUnisex(e.target.checked)} className="mt-0.5 size-5 accent-orange" />
              <span><strong className="block text-olive">Show a “Unisex” category in the shop</strong>
                <span className="text-xs text-muted">Untick to hide it: no Unisex tab or link anywhere in the shop. Unisex products still show under Men’s (on a man) and Women’s (on a woman), and in Shop all.</span></span>
            </label>
          </fieldset>
          <fieldset className="rounded-lg border border-line p-4">
            <legend className="px-1 text-sm font-bold text-olive">Checkout mode</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([['test', 'Test (preview)', 'Orders are saved as test orders. No payment, nothing sent to print.'], ['live', 'Live (Stripe)', 'Customers pay by card on Stripe. Paid orders go to Gelato for printing by themselves.']] as const).map(([v, label, text]) => (
                <label key={v} className={`flex cursor-pointer gap-2.5 rounded-lg border-2 p-3 text-sm ${mode === v ? 'border-orange bg-orange-soft/40' : 'border-line'}`}>
                  <input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} className="mt-0.5 accent-orange" />
                  <span><strong className="block text-olive">{label}</strong><span className="text-xs text-muted">{text}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" onClick={save} disabled={!dirty} className="btn-primary w-full">Save settings</button>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-xl">Gelato sync</h2>
          <p className="text-sm text-muted">Products, photos, colours, sizes and costs are copied from your Gelato store automatically every 5 minutes.</p>
          <p className="text-sm">Last product sync: <strong>{s.last_product_sync ? new Date(s.last_product_sync).toLocaleString() : 'never'}</strong></p>
          <button type="button" onClick={() => sync('sync-products')} disabled={!!syncing} className="btn-dark"><RefreshCw className={`size-4 ${syncing === 'sync-products' ? 'animate-spin' : ''}`} aria-hidden /> {syncing === 'sync-products' ? 'Syncing…' : 'Sync products now'}</button>
          <p className="text-sm text-muted">Order statuses and tracking numbers are pulled from Gelato automatically every 15 minutes. You can also sync now. This also re-sends any paid orders that failed to reach Gelato.</p>
          <p className="text-sm">Last order sync: <strong>{s.last_api_sync ? new Date(s.last_api_sync).toLocaleString() : 'never'}</strong></p>
          <button type="button" onClick={() => sync('sync-order-status')} disabled={!!syncing} className="btn-dark"><RefreshCw className={`size-4 ${syncing === 'sync-order-status' ? 'animate-spin' : ''}`} aria-hidden /> {syncing === 'sync-order-status' ? 'Syncing…' : 'Sync orders now'}</button>
          <div className="rounded-lg bg-cream-2/70 p-4 text-sm">
            <p className="font-bold text-olive">Real-time webhook (optional)</p>
            <p className="mt-1 text-muted">In Gelato → Developer → Webhooks, add a webhook for order status updates pointing to:</p>
            <code className="mt-2 block break-all rounded bg-white p-2 text-xs select-all">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/gelato-webhook?token={token ?? '…'}</code>
            <p className="mt-1 text-xs text-muted">Keep this URL private: the token proves calls come from Gelato.</p>
          </div>
        </section>
      </div>
    </>
  )
}
