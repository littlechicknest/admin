import type { ReactNode } from 'react'
import { ExternalLink, Home, Images, LogOut, MessageSquareText, Package, Settings, Shirt, Star, Users } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../context/auth'
import { SHOP_URL } from '../lib/shop'

export const Logo = ({ className }: { className: string }) => <img src={`${import.meta.env.BASE_URL}img/logo.png`} alt="Little Chick Nest" width={480} height={390} className={`${className} w-auto`} />

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/products', label: 'Products', icon: Shirt },
  { to: '/orders', label: 'Orders', icon: Package },
  { to: '/photos', label: 'Website photos', icon: Images },
  { to: '/reviews', label: 'Reviews', icon: Star },
  { to: '/messages', label: 'Messages', icon: MessageSquareText },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/settings', label: 'Prices & settings', icon: Settings },
]

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const cls = ({ isActive }: { isActive: boolean }) =>
    `flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-base font-semibold transition-colors ${isActive ? 'bg-cream/15 text-cream' : 'text-cream/75 hover:bg-cream/10 hover:text-cream'}`

  return (
    <div className="min-h-screen bg-cream">
      <aside className="bg-olive text-cream lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:h-screen lg:w-[240px] lg:flex-col lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-2 px-4 py-4 lg:block lg:px-5 lg:py-6">
          <NavLink to="/" className="rounded-xl bg-cream p-2 lg:inline-block" aria-label="Admin home"><Logo className="h-10" /></NavLink>
          <p className="label-caps text-cream/70 lg:mt-4">Shop admin</p>
          <button type="button" onClick={signOut} className="rounded-lg p-2 lg:hidden" aria-label="Sign out"><LogOut className="size-5" aria-hidden /></button>
        </div>
        <nav aria-label="Admin" className="flex gap-1 lg:flex-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={cls}><Icon className="size-5" aria-hidden />{label}</NavLink>
          ))}
        </nav>
        <div className="hidden space-y-1 border-t border-cream/15 px-3 py-4 lg:block">
          <a href={SHOP_URL} target="_blank" rel="noopener noreferrer" className={cls({ isActive: false })}><ExternalLink className="size-5" aria-hidden /> View shop</a>
          <button type="button" onClick={signOut} className={`${cls({ isActive: false })} w-full`}><LogOut className="size-5" aria-hidden /> Sign out</button>
          <p className="truncate px-3 pt-2 text-xs text-cream/60" title={profile?.email ?? ''}>{profile?.email}</p>
        </div>
      </aside>
      <main className="min-w-0 px-4 lg:ml-[240px] py-6 sm:px-6 lg:px-10 lg:py-8"><Outlet /></main>
    </div>
  )
}

export const AdminTitle = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <h1 className="text-3xl">{title}</h1>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
)

