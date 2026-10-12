import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, ChevronRight, ClipboardList, User } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import SectionCard from '../../components/SectionCard'
import Badge from '../../components/Badge'
import { CURRENT_PATIENT_ID } from '../patientData'

export default function Home() {
  const { patients } = useApp()
  const patient = patients.find((p) => p.patient_id === CURRENT_PATIENT_ID)
  const [taken, setTaken] = useState({})

  if (!patient) return null

  const total = patient.schedules.length
  const doneCount = patient.schedules.filter((item) => taken[item.id]).length
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-slate-500">{today}</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900">
          Hello, {patient.name.split(' ')[0]}
        </h1>
      </div>

      {patient.allergies.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-800">Allergy alert</p>
            <p className="mt-0.5 text-sm text-rose-700">{patient.allergies.join(', ')}</p>
            <p className="mt-1 text-xs text-rose-600">
              Always mention this to your doctor or pharmacist.
            </p>
          </div>
        </div>
      )}

      <SectionCard
        title="Today's medicines"
        action={
          total > 0 && doneCount === total ? (
            <Badge tone="approved">All taken</Badge>
          ) : (
            <Badge tone="neutral">
              {doneCount}/{total}
            </Badge>
          )
        }
      >
        {total === 0 ? (
          <p className="text-sm text-slate-400">No medicines scheduled right now.</p>
        ) : (
          <ul className="space-y-2.5">
            {patient.schedules.map((item) => (
              <li
                key={item.id}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                  taken[item.id]
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {item.medicine_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.dosage} · {item.timing_slot}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTaken((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                  className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                    taken[item.id]
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {taken[item.id] ? 'Taken' : 'Mark taken'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Your care">
        <ul className="divide-y divide-slate-100">
          <li>
            <Link to="/patient/prescriptions" className="flex items-center justify-between py-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                <ClipboardList size={16} className="text-slate-400" /> Prescriptions
              </span>
              <ChevronRight size={16} className="text-slate-300" />
            </Link>
          </li>
          <li>
            <Link to="/patient/timeline" className="flex items-center justify-between py-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                <CalendarDays size={16} className="text-slate-400" /> Medical timeline
              </span>
              <ChevronRight size={16} className="text-slate-300" />
            </Link>
          </li>
          <li>
            <Link to="/patient/profile" className="flex items-center justify-between py-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                <User size={16} className="text-slate-400" /> Health profile & QR
              </span>
              <ChevronRight size={16} className="text-slate-300" />
            </Link>
          </li>
        </ul>
      </SectionCard>
    </div>
  )
}
