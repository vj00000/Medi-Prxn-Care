import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, FlaskConical, Info, X } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { StatusBadge } from '../components/Badge'
import Button from '../components/Button'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'In review' },
  { key: 'approved', label: 'Approved' },
]

export default function Prescriptions() {
  const { prescriptions, getPatient, approvePrescription, warnings, interactionNote, clearWarnings } = useApp()
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

      {interactionNote && (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <Info size={18} className="mt-0.5 shrink-0 text-slate-500" />
          <p className="min-w-0 flex-1 text-sm text-slate-600">{interactionNote}</p>
          <button
            type="button"
            onClick={clearWarnings}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-200"
            aria-label="Dismiss interaction note"
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

                {rx.medicines.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                          <th className="px-3 py-2 font-medium">Medicine</th>
                          <th className="px-3 py-2 font-medium">Dosage</th>
                          <th className="px-3 py-2 font-medium">Frequency</th>
                          <th className="px-3 py-2 font-medium">Days</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rx.medicines.map((medicine, index) => (
                          <tr key={index}>
                            <td className="px-3 py-2 font-medium text-slate-800">
                              {medicine.name}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{medicine.dosage ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{medicine.timings ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{medicine.duration_days ?? '—'}</td>
                            <td className="px-3 py-2">
                              {medicine.is_active ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                  Active
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                  Inactive
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {rx.lab_test && (
                  <p className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500">
                    <FlaskConical size={14} /> Lab test: {rx.lab_test}
                  </p>
                )}

                {rx.diagnosis && (
                  <p className="mt-3 text-sm text-slate-700">
                    <span className="font-medium text-slate-500">Diagnosis:</span>{' '}
                    {rx.diagnosis}
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
