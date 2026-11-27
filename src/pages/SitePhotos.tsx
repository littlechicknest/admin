import { ImageUp, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Alert, Spinner, useTitle } from '../components/ui'
import { imgSrc } from '../lib/shop'
import { supabase } from '../lib/supabase'
import { removeFiles, storeImage } from '../lib/upload'
import { AdminTitle } from './AdminLayout'

// Same names as DEFAULTS in the shop repo (src/lib/siteImages.tsx): [slot, label, picture shipped with the site]
const SLOTS: [group: string, [slot: string, label: string, original: string][]][] = [
  ['Home page: big slideshow', [['hero-1', 'Slide 1', 'banners/hero-hoodie.webp'], ['hero-2', 'Slide 2', 'banners/hero-cap.webp'], ['hero-3', 'Slide 3', 'banners/hero-mug.webp']]],
  ['Home page: category circles', [['category-men', "Men's", 'products/man-olive-cap.webp'], ['category-women', "Women's", 'products/hoodie-beige.webp'], ['category-kids', "Kids'", 'products/set-classic.webp'], ['category-accessories', 'Accessories', 'products/mug-olive.webp']]],
  ['Home page: our story', [['story-1', 'Left picture', 'banners/story-hoodie.webp'], ['story-2', 'Middle picture', 'banners/story-cap.webp'], ['story-3', 'Right picture', 'banners/story-mug.webp'], ['why', 'Why families love our shop', 'products/gift-box.webp']]],
  ['Our story page', [['about-top', 'Top picture', 'banners/about-mug.webp'], ['about-1', 'Thoughtful materials', 'products/tee-cream-detail.webp'], ['about-2', 'Embroidered with care', 'products/cap-back.webp'], ['about-3', 'Made for gifting', 'products/set-classic.webp']]],
  ['Contact and sign-in pages', [['contact-top', 'Contact: top', 'banners/contact-man.webp'], ['contact-bottom', 'Contact: bottom', 'products/set-premium.webp'], ['login', 'Sign in', 'banners/login-hoodie.webp']]],
  ['Logo', [['logo', 'Logo', 'img/logo.png'], ['chick', 'Little chick drawing', 'img/chick.png']]],
]

type Images = Record<string, string>
const load = () => supabase.from('store_settings').select('site_images').eq('id', 1).single()

export default function SitePhotos() {
  useTitle('Website photos')
  const [images, setImages] = useState<Images | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  useEffect(() => {
    load().then(({ data, error }) => (error ? setMsg({ tone: 'error', text: error.message }) : setImages(data.site_images as Images)))
  }, [])

  /** New picture, or null to go back to the original. */
  const set = async (slot: string, label: string, file: File | null) => {
    setBusy(slot)
    setMsg(null)
    try {
      const url = file && (await storeImage(`site/${slot}`, file))
      const { data, error } = await load() // another tab may have changed a different picture
      if (error) throw error
      const { [slot]: old, ...rest } = data.site_images as Images
      const next = url ? { ...rest, [slot]: url } : rest
      const { error: e2 } = await supabase.from('store_settings').update({ site_images: next }).eq('id', 1)
      if (e2) throw e2
      setImages(next)
      if (old && old !== url) await removeFiles([old])
      setMsg({ tone: 'success', text: `${label}: ${url ? 'new picture is live on the website' : 'original picture is back'}.` })
    } catch (e) {
      console.error(e)
      setMsg({ tone: 'error', text: `${label}: that picture could not be used. Please try a JPG or PNG.` })
    }
    setBusy(null)
  }

  return (
    <>
      <AdminTitle title="Website photos" sub="Change the big pictures on the shop pages." />
      <p className="mb-5 max-w-2xl text-muted">Click <strong>Change picture</strong> and choose a photo from your computer. It goes live on the website straight away. Product photos are changed under Products.</p>
      <div aria-live="polite" className="sticky top-2 z-20 mb-4">{msg && <Alert tone={msg.tone}>{msg.text}</Alert>}</div>
      {!images ? !msg && <Spinner /> : SLOTS.map(([group, slots]) => (
        <section key={group} className="card mb-6 p-5">
          <h2 className="mb-4 text-xl">{group}</h2>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {slots.map(([slot, label, original]) => (
              <li key={slot} className="space-y-3">
                <img src={imgSrc(images[slot] ?? original) ?? ''} alt={label} loading="lazy" className="aspect-[4/3] w-full rounded-lg bg-cream-2 object-contain" />
                <p className="font-semibold text-olive">{label}</p>
                <label className={`btn-dark w-full cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange ${busy ? 'pointer-events-none opacity-60' : ''}`}>
                  <ImageUp className="size-4" aria-hidden /> {busy === slot ? 'Uploading…' : 'Change picture'}
                  <input type="file" accept="image/*" className="sr-only" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void set(slot, label, f); e.target.value = '' }} />
                </label>
                {images[slot] && <button type="button" disabled={!!busy} onClick={() => void set(slot, label, null)} className="flex items-center gap-1 text-sm font-semibold text-olive hover:underline"><Undo2 className="size-4" aria-hidden /> Put back the original</button>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
