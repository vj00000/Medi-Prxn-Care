export default function SectionCard({ title, action, children, className = '' }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
