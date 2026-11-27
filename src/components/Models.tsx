import { Box, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Json } from '../lib/database.types'
import { detect } from '../lib/mockups'
import { isModelLink, parse3d, withImage } from '../lib/model3d'
import { supabase } from '../lib/supabase'
import { keepModelImage, paletteOf, type Product } from '../lib/upload'
import { Alert } from './ui'

const asModels = (v: Json): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => isModelLink(e[1]))) : {}

/** One Gelato 3D preview per colour ('' = the product has no colours). Shown in the shop with a "3D" button. */
export function ModelManager({ product, onChange }: { product: Product; onChange: () => Promise<void> }) {
  const palette = paletteOf(product)
  const rows = palette.colors.length ? palette.colors : [{ name: '', hex: undefined }]
  const [models, setModels] = useState(() => asModels(product.models))
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; problem: boolean } | null>(null)

  /** Applied to what the database has now. */
  const write = async (key: string, link: string | null) => {
    const { data, error } = await supabase.from('products').select('models').eq('id', product.id).single()
    if (error) throw error
    const next = { ...asModels(data.models) }
    if (link) next[key] = link
    else delete next[key]
    const { error: e2 } = await supabase.from('products').update({ models: next }).eq('id', product.id)
    if (e2) throw e2
    setModels(next)
    void onChange()
  }

  const save = async (key: string) => {
    const m = parse3d(codes[key] ?? '')
    if (!m) return setMsg({ text: 'That is not a Gelato 3D code. In Gelato, open the 3D preview, copy its code (it starts with <iframe) and paste it here.', problem: true })
    const shows = palette.colors.length > 1 ? detect(m.uid, palette).color : null
    if (key && shows && shows !== key && !confirm(`This 3D code looks like the ${shows} one, not ${key}.\n\nSave it for ${key} anyway?`)) return
    setBusy(key)
    setMsg(null)
    try {
      await write(key, withImage(m, await keepModelImage(product.id, m.image)))
      setCodes((c) => ({ ...c, [key]: '' }))
      setMsg({ text: `3D preview saved${key ? ` for ${key}` : ''}. Customers now see a “3D” button in the shop.`, problem: false })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Not saved. Please try again.', problem: true })
    }
    setBusy(null)
  }

  const remove = async (key: string) => {
    if (!confirm('Remove this 3D preview from the shop?')) return
    setBusy(key)
    try { await write(key, null); setMsg({ text: 'Removed.', problem: false }) } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Not removed.', problem: true }) }
    setBusy(null)
  }

  const count = Object.keys(models).length
  return (
    <details className="card p-5" open={count > 0 || /mug|bottle|tumbler|cup/i.test(product.title)}>
      <summary className="flex cursor-pointer items-center gap-3 text-xl font-semibold text-olive">
        <Box className="size-6 text-orange" aria-hidden /> 3D preview <span className="font-sans text-sm font-normal text-muted">{count ? `${count} saved` : 'for mugs and bottles'}</span>
      </summary>
      <p className="mt-3 text-base text-olive">
        In Gelato, open the product’s <strong>3D preview</strong> for one colour, copy its code (it starts with <code>&lt;iframe</code>) and paste it in that colour’s box. Do one colour at a time. Gelato’s code stops working after a day, so we keep a copy that lasts.
      </p>
      <div aria-live="polite" className="mt-3">{msg && <Alert tone={msg.problem ? 'error' : 'success'}>{msg.text}</Alert>}</div>
      <ul className="mt-4 grid gap-4 lg:grid-cols-2">
        {rows.map((c) => (
          <li key={c.name} className="rounded-xl border-2 border-line bg-paper p-4">
            <h3 className="mb-3 flex items-center gap-3 text-lg">
              {c.name && <span className="size-6 rounded-full ring-1 ring-black/15" style={{ background: c.hex ?? '#ccc' }} />}
              {c.name || 'This product'}
              {models[c.name] && <span className="rounded bg-olive px-2 py-0.5 font-sans text-sm text-white">3D saved</span>}
            </h3>
            {models[c.name] ? (
              <>
                <iframe src={models[c.name]} title={`3D preview ${c.name}`} loading="lazy" className="aspect-square w-full max-w-72 rounded-lg border border-line bg-white" />
                <button type="button" disabled={busy === c.name} onClick={() => void remove(c.name)} className="mt-2 flex items-center gap-1 rounded px-2 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50">
                  <Trash2 className="size-4" aria-hidden /> Remove 3D
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <textarea className="input font-mono text-xs" rows={3} placeholder='Paste the Gelato 3D code here: <iframe src="https://…'
                  value={codes[c.name] ?? ''} onChange={(e) => setCodes((x) => ({ ...x, [c.name]: e.target.value }))} />
                <button type="button" className="btn-primary self-start" disabled={!!busy || !(codes[c.name] ?? '').trim()} onClick={() => void save(c.name)}>
                  {busy === c.name ? 'Saving…' : 'Save 3D'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
