import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, FlaskConical, X } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { StatusBadge } from '../components/Badge'
import Button from '../components/Button'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'In review' },
  { key: 'approved', label: 'Approved' },
]

export default function Prescriptions() {
  const { prescriptions, getPatient, approvePrescription, warnings, clearWarnings } = useApp()
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')

  const list = useMemo(
    () => (filter === 'all' ? prescriptions : prescriptions.filter((rx) => rx.status === filter)),
    [prescriptions, filter],
  )

  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-800">Safety check</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-rose-700">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={clearWarnings}
            className="rounded-lg p-1 text-rose-500 transition-colors hover:bg-rose-100"
            aria-label="Dismiss safety warnings"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === option.key
                ? 'bg-brand-700 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          No prescriptions in this view.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((rx) => {
            const patient = getPatient(rx.patient_id)
            return (
              <li key={rx.prescription_id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/patients/${rx.patient_id}`}
                      className="text-sm font-semibold text-slate-900 hover:text-brand-700"
                    >
                      {patient?.name ?? `Patient #${rx.patient_id}`}
                    </Link>
                    <p className="text-xs text-slate-500">{rx.created}</p>
                  </div>
                  <StatusBadge status={rx.status} />
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {rx.medicines.map((medicine, index) => (
                    <span
                      key={index}
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                    >
                      {medicine.name} · {medicine.dosage}
                    </span>
                  ))}
                </div>

                {rx.lab_test && (
                  <p className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500">
                    <FlaskConical size={14} /> Lab test: {rx.lab_test}
                  </p>
                )}

                {rx.transcript && (
                  <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs italic text-slate-500">
                    “{rx.transcript}”
                  </p>
                )}

                {rx.status === 'review' && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await approvePrescription(rx.prescription_id)
                          setError('')
                        } catch (err) {
                          setError(`Could not approve the prescription: ${err.message}`)
                        }
                      }}
                    >
                      <Check size={15} /> Approve
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
