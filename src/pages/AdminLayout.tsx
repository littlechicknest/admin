import { useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, Home, Images, LogOut, Menu, MessageSquareText, Package, Settings, Shirt, Star, Users, X, Zap } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../context/auth'
import { optimiseAll } from '../lib/optimize'
import { SHOP_URL } from '../lib/shop'
import { supabase } from '../lib/supabase'

export const Logo = ({ className }: { className: string }) => <img src={`${import.meta.env.BASE_URL}img/logo.png`} alt="Little Chick Nest" width={480} height={390} className={`${className} w-auto`} />

type Badge = 'orders' | 'products' | 'reviews' | 'messages'
const NAV: { to: string; label: string; icon: typeof Home; end?: boolean; badge?: Badge; hint: string }[] = [
  { to: '/', label: 'Home', icon: Home, end: true, hint: 'Sales and what needs doing' },
  { to: '/orders', label: 'Orders', icon: Package, badge: 'orders', hint: 'What people bought' },
  { to: '/products', label: 'Products', icon: Shirt, badge: 'products', hint: 'Add, edit, hide' },
  { to: '/photos', label: 'Website photos', icon: Images, hint: 'Pictures on the shop pages' },
  { to: '/customers', label: 'Customers', icon: Users, hint: 'Who signed up' },
  { to: '/reviews', label: 'Reviews', icon: Star, badge: 'reviews', hint: 'Approve what shows' },
  { to: '/messages', label: 'Messages', icon: MessageSquareText, badge: 'messages', hint: 'From the contact form' },
  { to: '/settings', label: 'Settings', icon: Settings, hint: 'Prices, delivery, payments' },
]

/** Little numbers next to the menu: things waiting for the owner. */
function useBadges() {
  const [b, setB] = useState<Partial<Record<Badge, number>>>({})
  const { pathname } = useLocation()
  useEffect(() => {
    const head = { count: 'exact' as const, head: true }
    void Promise.all([
      supabase.from('orders').select('id', head).eq('status', 'paid'),
      supabase.from('products').select('id', head).eq('is_new', true),
      supabase.from('reviews').select('id', head).eq('is_approved', false),
      supabase.from('contact_messages').select('id', head).eq('is_read', false),
    ]).then(([o, p, r, m]) => setB({ orders: o.count ?? 0, products: p.count ?? 0, reviews: r.count ?? 0, messages: m.count ?? 0 }))
  }, [pathname])
  return b
}

/** Quietly turns any JPG/PNG product picture into a fast WebP while the admin is open (Gelato sends JPGs). */
function usePictureOptimiser() {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  useEffect(() => {
    let stop = false
    const go = () => optimiseAll((done, total) => !stop && setProgress({ done, total }))
      .catch((e) => console.warn('optimise', e)).finally(() => !stop && setProgress(null))
    const first = setTimeout(go, 4000) // let the page load first
    const again = setInterval(go, 10 * 60_000) // new Gelato pictures arrive every few minutes
    return () => { stop = true; clearTimeout(first); clearInterval(again) }
  }, [])
  return progress
}

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  // the menu belongs to the page it was opened on, so it closes by itself after choosing a page
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null)
  const badges = useBadges()
  const optimising = usePictureOptimiser()

  const cls = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors ${isActive ? 'bg-olive text-white shadow-sm' : 'text-ink/80 hover:bg-cream-2 hover:text-olive'}`

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <NavLink to="/" aria-label="Admin home"><Logo className="h-11" /></NavLink>
        <div className="leading-tight"><p className="font-display text-base font-bold text-olive">Little Chick Nest</p><p className="text-xs text-muted">Shop admin</p></div>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto rounded-lg p-2 hover:bg-cream-2 lg:hidden" aria-label="Close menu"><X className="size-5" aria-hidden /></button>
      </div>
      <nav aria-label="Admin" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV.map(({ to, label, icon: Icon, end, badge, hint }) => {
          const n = badge ? badges[badge] ?? 0 : 0
          return (
            <NavLink key={to} to={to} end={end} className={cls} title={hint}>
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
              {n > 0 && <span className="min-w-6 rounded-full bg-orange px-1.5 py-0.5 text-center text-xs font-bold text-white" aria-label={`${n} waiting`}>{n}</span>}
            </NavLink>
          )
        })}
      </nav>
      <div className="space-y-1 border-t border-line px-3 py-3">
        <a href={SHOP_URL} target="_blank" rel="noopener noreferrer" className={cls({ isActive: false })}><ExternalLink className="size-5" aria-hidden /> View my shop</a>
        <button type="button" onClick={signOut} className={`${cls({ isActive: false })} w-full`}><LogOut className="size-5" aria-hidden /> Sign out</button>
        <p className="truncate px-3 pt-1 text-xs text-muted" title={profile?.email ?? ''}>{profile?.email}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-canvas">
      {/* desktop: fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-line bg-paper lg:block">{sidebar}</aside>

      {/* phone / tablet: top bar + slide-in menu */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-line p-2" aria-label="Open menu" aria-expanded={open}><Menu className="size-5" aria-hidden /></button>
        <Logo className="h-8" />
        <span className="font-display font-bold text-olive">Shop admin</span>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 animate-fade-in bg-ink/40" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="absolute inset-y-0 left-0 w-[280px] animate-slide-in-left bg-paper shadow-xl">{sidebar}</aside>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:ml-[260px] lg:px-10 lg:py-8">
        <div className="mx-auto max-w-[1200px]"><Outlet /></div>
      </main>

      {optimising && optimising.total > 0 && (
        <div role="status" className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-sm shadow-lg">
          <Zap className="size-4 text-orange" aria-hidden /> Making pictures load faster… {optimising.done} of {optimising.total}
        </div>
      )}
    </div>
  )
}

export const AdminTitle = ({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-[28px] leading-tight">{title}</h1>
      {sub && <p className="mt-1 text-base text-muted">{sub}</p>}
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
)
