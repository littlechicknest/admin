import { Check, Info, Loader2, Star } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | Little Chick Nest admin` : 'Little Chick Nest admin'
  }, [title])
}

export const Spinner = ({ label = 'Loading' }: { label?: string }) => (
  <div role="status" className="flex items-center justify-center gap-2 py-16 text-muted">
    <Loader2 className="size-5 animate-spin" aria-hidden /> <span>{label}…</span>
  </div>
)

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-leaf/40 bg-[#f1f7ea] text-olive',
    info: 'border-yolk/40 bg-[#fff7e0] text-olive',
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-2.5 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {tone === 'success' ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div>{children}</div>
    </div>
  )
}

export const Field = ({ label, hint, error, optional, children }: { label: string; hint?: string; error?: string | null; optional?: boolean; children: ReactNode }) => (
  <label className="block">
    <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-semibold text-olive">
      {label}{optional && <span className="text-xs font-normal text-muted">Optional</span>}
    </span>
    {children}
    {error ? <span role="alert" className="mt-1 block text-xs font-medium text-red-700">{error}</span>
      : hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
)

export function Stars({ value, size = 'size-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={`${size} ${i <= Math.round(value) ? 'fill-yolk text-yolk' : 'text-sand'}`} />
      ))}
    </span>
  )
}


/** A white box with a heading and a short plain-English explanation. */
export const Section = ({ title, sub, children, className = '' }: { title: string; sub?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`card space-y-4 p-5 sm:p-6 ${className}`}>
    <div>
      <h2 className="font-sans text-lg font-bold">{title}</h2>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </div>
    {children}
  </section>
)

/** "Saved" style message that slides in at the bottom and goes away by itself. */
export function useToast(): [ReactNode, (text: string, problem?: boolean) => void] {
  const [msg, setMsg] = useState<{ text: string; problem: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const show = useCallback((text: string, problem = false) => {
    setMsg({ text, problem })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), problem ? 7000 : 2500)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const node = msg && (
    <div role={msg.problem ? 'alert' : 'status'} className={`fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 animate-fade-up items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg lg:left-[calc(50%+130px)] ${msg.problem ? 'bg-red-700 text-white' : 'bg-olive text-white'}`}>
      {msg.problem ? <Info className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />} {msg.text}
    </div>
  )
  return [node, show]
}
