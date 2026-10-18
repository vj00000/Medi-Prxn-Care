import { ExternalLink, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useCart } from '../cartContext'
import SectionCard from '../../components/SectionCard'
import Button from '../../components/Button'
import { oneMgUrl } from '../patientData'

export default function Cart() {
  const { items, setQuantity, remove, clear } = useCart()

  function buyNow() {
    items.forEach((item) => {
      window.open(oneMgUrl(item.medicine_name), '_blank', 'noopener,noreferrer')
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Reorder cart</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Medicines you have added to reorder.
        </p>
      </div>

      {items.length === 0 ? (
        <SectionCard>
          <p className="text-sm text-slate-400">
            Your cart is empty. Add medicines from the Meds tab.
          </p>
        </SectionCard>
      ) : (
        <>
          <SectionCard title={`${items.length} item(s)`}>
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.key} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {item.medicine_name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[item.dosage, item.timing_slot].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-[11px] text-slate-400">for {item.member}</p>
                  </div>

                  <a
                    href={oneMgUrl(item.medicine_name)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                    aria-label={`Buy ${item.medicine_name} on Tata 1mg`}
                  >
                    <ExternalLink size={13} /> Buy
                  </a>

                  <div className="flex shrink-0 items-center rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setQuantity(item.key, item.quantity - 1)}
                      className="p-1.5 text-slate-500 transition-colors hover:text-slate-800"
                      aria-label={`Decrease ${item.medicine_name}`}
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-6 text-center text-sm font-medium text-slate-800">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(item.key, item.quantity + 1)}
                      className="p-1.5 text-slate-500 transition-colors hover:text-slate-800"
                      aria-label={`Increase ${item.medicine_name}`}
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(item.key)}
                    className="shrink-0 rounded-lg p-1.5 text-rose-500 transition-colors hover:bg-rose-50"
                    aria-label={`Remove ${item.medicine_name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={clear}>
              Clear
            </Button>
            <Button className="flex-1" onClick={buyNow}>
              <ShoppingBag size={15} /> Buy now
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
