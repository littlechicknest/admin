import { Check, Info, Loader2, Star } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

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

