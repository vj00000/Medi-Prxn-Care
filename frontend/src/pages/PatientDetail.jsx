import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Phone, Plus, QrCode } from 'lucide-react'
import { useApp } from '../store/AppStore'
import Badge, { StatusBadge } from '../components/Badge'
import Button from '../components/Button'
import SectionCard from '../components/SectionCard'

function initials(name) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

function scheduleDays(schedule) {
  if (!schedule.start_date || !schedule.end_date) return null
  return Math.round((new Date(schedule.end_date) - new Date(schedule.start_date)) / 86400000)
}

export default function PatientDetail() {
  const { id } = useParams()
  const { getPatient, getPrescriptionsFor, loading } = useApp()
  const patient = getPatient(id)

  if (loading) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-slate-500">Loading patient…</p>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-slate-500">Patient not found.</p>
        <Link
          to="/patients"
          className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline"
        >
          Back to patients
        </Link>
      </div>
    )
  }

  const history = getPrescriptionsFor(patient.patient_id)

  return (
    <div className="space-y-6">
      <Link
        to="/patients"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} /> Back to patients
      </Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-lg font-semibold text-brand-700">
              {initials(patient.name)}
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                {patient.name}
              </h1>
              <p className="text-sm text-slate-500">
                {[
                  `${patient.age} years`,
                  patient.gender,
                  patient.lastVisit && `Last visit ${patient.lastVisit}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <Button as={Link} to={`/patients/${patient.patient_id}/prescribe`}>
            <Plus size={16} /> New prescription
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <QrCode size={15} /> {patient.qr_token}
          </span>
          {patient.phone && (
            <span className="inline-flex items-center gap-2">
              <Phone size={15} /> {patient.phone}
            </span>
          )}
        </div>

        {patient.allergies.length > 0 && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
            <div>
              <p className="text-sm font-semibold text-rose-800">Known allergies</p>
              <p className="mt-0.5 text-sm text-rose-700">{patient.allergies.join(', ')}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Conditions">
          {patient.diseases.length === 0 ? (
            <p className="text-sm text-slate-400">No recorded conditions.</p>
          ) : (
            <ul className="space-y-2.5">
              {patient.diseases.map((disease) => (
                <li key={disease.id} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">{disease.name}</span>
                  <Badge tone="brand">Active</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Current medications">
          {patient.schedules.length === 0 ? (
            <p className="text-sm text-slate-400">No active medications.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2 font-medium">Medicine</th>
                    <th className="px-3 py-2 font-medium">Dosage</th>
                    <th className="px-3 py-2 font-medium">Timing</th>
                    <th className="px-3 py-2 font-medium">Days</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patient.schedules.map((schedule) => (
                    <tr key={schedule.id}>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {schedule.medicine_name}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{schedule.dosage ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{schedule.timing_slot ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{scheduleDays(schedule) ?? '—'}</td>
                      <td className="px-3 py-2">
                        {schedule.is_expired ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                            Expired
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Family medical history">
        {patient.familyHistory.length === 0 ? (
          <p className="text-sm text-slate-400">No family history recorded.</p>
        ) : (
          <ul className="space-y-3">
            {patient.familyHistory.map((entry) => (
              <li key={entry.id} className="rounded-xl bg-slate-50 p-3.5">
                <p className="text-sm font-medium text-slate-800">
                  {entry.relation} · {entry.condition_name}
                </p>
                {entry.additional_notes && (
                  <p className="mt-0.5 text-xs text-slate-500">{entry.additional_notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Prescription history">
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">No prescriptions yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {history.map((rx) => (
              <li key={rx.prescription_id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {rx.medicines.map((m) => m.name).join(', ') || '—'}
                  </p>
                  <p className="text-xs text-slate-500">{rx.created}</p>
                </div>
                <StatusBadge status={rx.status} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
