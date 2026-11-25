import { FlaskConical } from 'lucide-react'
import { STATUS_LABEL } from '../lib/shop'

export function StatusBadge({ status }: { status: string }) {
  const tone = ['cancelled', 'refunded'].includes(status) ? 'bg-red-50 text-red-800 ring-red-200'
    : status === 'delivered' ? 'bg-[#eef6e6] text-olive ring-leaf/30'
    : status === 'shipped' ? 'bg-[#e8f1fb] text-[#1f4f86] ring-[#1f4f86]/20'
    : status === 'pending' ? 'bg-cream-2 text-muted ring-sand'
    : 'bg-orange-soft text-orange-2 ring-orange/25'
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 ${tone}`}>{STATUS_LABEL[status] ?? status}</span>
}

export const TestBadge = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4d6] px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-[#8a5a00] uppercase ring-1 ring-yolk/40">
    <FlaskConical className="size-3" aria-hidden /> Test order
  </span>
)
