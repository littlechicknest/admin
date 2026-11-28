import { Box, Eye, Trash2, Upload } from 'lucide-react'
import { createElement, useEffect, useState } from 'react'
import type { Json } from '../lib/database.types'
import { isModelLink } from '../lib/model3d'
import { supabase } from '../lib/supabase'
import { paletteOf, removeModels, storeModel, type Product } from '../lib/upload'
import { Alert, Spinner } from './ui'

const asModels = (v: Json): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => isModelLink(e[1]))) : {}

let viewer: Promise<unknown> | null = null
/** The 3D viewer is only downloaded when a preview is opened. */
function Preview({ src, title }: { src: string; title: string }) {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    let on = true
    ;(viewer ??= import('@google/model-viewer').catch((e) => { viewer = null; throw e })).then(() => on && setOk(true), () => on && setOk(false))
    return () => { on = false }
  }, [])
  if (ok === false) return <p className="text-red-700">The 3D viewer could not load. Please refresh the page.</p>
  if (!ok) return <div className="grid aspect-square w-full max-w-80 place-items-center rounded-lg border border-line bg-white"><Spinner /></div>
  // the viewer's own style fixes its height at 150px: it fills a square box instead
  return (
    <div className="aspect-square w-full max-w-80 overflow-hidden rounded-lg border border-line bg-white">
      {createElement('model-viewer', { src, alt: title, 'camera-controls': '', 'auto-rotate': '', 'shadow-intensity': '1', style: { display: 'block', width: '100%', height: '100%' } })}
    </div>
  )
}

/** A 3D model (.glb file) for the whole product, and if needed a different one per colour. The shop shows a "3D preview" button only when there is one. */
export function ModelManager({ product, onChange }: { product: Product; onChange: () => Promise<void> }) {
  const palette = paletteOf(product)
  const rows = [{ name: '', hex: undefined as string | undefined }, ...(palette.colors.length > 1 ? palette.colors : [])]
  const [models, setModels] = useState(() => asModels(product.models))
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; problem: boolean } | null>(null)

  /** Applied to what the database has now; deletes the file it replaces when nothing else uses it. */
  const write = async (key: string, link: string | null) => {
    const { data, error } = await supabase.from('products').select('models').eq('id', product.id).single()
    if (error) throw error
    const before = asModels(data.models)
    const next = { ...before }
    if (link) next[key] = link
    else delete next[key]
    const { error: e2 } = await supabase.from('products').update({ models: next }).eq('id', product.id)
    if (e2) throw e2
    setModels(next)
    const old = before[key]
    if (old && old !== link && !Object.values(next).includes(old)) await removeModels([old]).catch(() => undefined)
    void onChange()
  }

  const upload = async (key: string, file: File | undefined) => {
    if (!file || busy) return
    setBusy(key)
    setMsg(null)
    try {
      await write(key, await storeModel(product.id, file))
      setOpen(key)
      setMsg({ text: `3D model saved${key ? ` for ${key}` : ''}. Customers now see a “3D preview” button in the shop.`, problem: false })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Not saved. Please try again.', problem: true })
    }
    setBusy(null)
  }

  const remove = async (key: string) => {
    if (!confirm('Remove this 3D model from the shop?')) return
    setBusy(key)
    try { await write(key, null); setMsg({ text: 'Removed.', problem: false }) } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Not removed.', problem: true }) }
    setBusy(null)
  }

  const count = Object.keys(models).length
  return (
    <details className="card p-5" open={count > 0 || product.category === 'Accessories' || /mug|bottle|tumbler|cup/i.test(product.title)}>
      <summary className="flex cursor-pointer items-center gap-3 text-xl font-semibold text-olive">
        <Box className="size-6 text-orange" aria-hidden /> 3D model <span className="font-sans text-sm font-normal text-muted">{count ? `${count} saved` : 'for mugs, bottles and accessories'}</span>
      </summary>
      <p className="mt-3 text-base text-olive">
        Upload a <strong>.glb</strong> file (a 3D model, up to 50 MB). The shop then shows a <strong>3D preview</strong> button on this product; the model only loads when a customer presses it. No file = no button.
        {rows.length > 1 && <> One model for <strong>all colours</strong> is enough. Add one to a colour only if that colour should show a different model.</>}
      </p>
      <div aria-live="polite" className="mt-3">{msg && <Alert tone={msg.problem ? 'error' : 'success'}>{msg.text}</Alert>}</div>
      <ul className="mt-4 grid gap-4 lg:grid-cols-2">
        {rows.map((c) => {
          const link = models[c.name]
          return (
            <li key={c.name} className="rounded-xl border-2 border-line bg-paper p-4">
              <h3 className="mb-3 flex items-center gap-3 text-lg">
                {c.name && <span className="size-6 rounded-full ring-1 ring-black/15" style={{ background: c.hex ?? '#ccc' }} />}
                {c.name || (rows.length > 1 ? 'All colours' : 'This product')}
                {link ? <span className="rounded bg-olive px-2 py-0.5 font-sans text-sm text-white">3D saved</span>
                  : c.name && models[''] && <span className="font-sans text-sm font-normal text-muted">uses the “All colours” model</span>}
              </h3>
              {link && (open === c.name ? <Preview src={link} title={`${product.title} ${c.name}`} /> : (
                <button type="button" className="btn-ghost mb-1" onClick={() => setOpen(c.name)}><Eye className="size-4" aria-hidden /> Look at it in 3D</button>
              ))}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className={`btn-primary cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange ${busy ? 'pointer-events-none opacity-70' : ''}`}>
                  <Upload className="size-4" aria-hidden />
                  <span aria-live="polite">{busy === c.name ? 'Uploading…' : link ? 'Replace .glb file' : 'Upload .glb file'}</span>
                  <input type="file" accept=".glb,model/gltf-binary" className="sr-only" disabled={!!busy} onChange={(e) => { void upload(c.name, e.target.files?.[0]); e.target.value = '' }} />
                </label>
                {link && (
                  <button type="button" disabled={!!busy} onClick={() => void remove(c.name)} className="flex items-center gap-1 rounded px-2 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50">
                    <Trash2 className="size-4" aria-hidden /> Remove 3D
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
