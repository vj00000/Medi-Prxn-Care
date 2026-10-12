const TONES = {
  review: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export default function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium
        ring-1 ring-inset ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ status }) {
  return (
    <Badge tone={status === 'approved' ? 'approved' : 'review'}>
      {status === 'approved' ? 'Approved' : 'In review'}
    </Badge>
  )
}
