import { QRCodeSVG } from 'qrcode.react'
import { Phone } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import SectionCard from '../../components/SectionCard'
import Badge from '../../components/Badge'

function initials(name) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function Profile() {
  const { patients, loading, patientId } = useApp()
  const patient = patients.find((p) => p.patient_id === patientId)

  if (loading) {
    return <p className="px-1 text-sm text-slate-400">Loading your profile…</p>
  }

  if (!patient) return null

  return (
    <div className="space-y-5">
      <div className="card p-5 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-xl font-semibold text-brand-700">
          {initials(patient.name)}
        </span>
        <h1 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">
          {patient.name}
        </h1>
        <p className="text-sm text-slate-500">
          {patient.age} years · {patient.gender}
        </p>
        {patient.phone && (
          <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
            <Phone size={14} /> {patient.phone}
          </p>
        )}
      </div>

      <SectionCard title="My health QR">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <QRCodeSVG
              value={JSON.stringify({
                patient_family_id: patient.family_id,
                patient_id: patient.patient_id,
              })}
              size={200}
              fgColor="#0f766e"
            />
          </div>
          <p className="text-center text-xs text-slate-500">
            Show this to your doctor to share your record instantly.
          </p>
          <p className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-600">
            {patient.qr_token}
          </p>
        </div>
      </SectionCard>

      {patient.allergies.length > 0 && (
        <SectionCard title="Allergies">
          <div className="flex flex-wrap gap-2">
            {patient.allergies.map((allergy) => (
              <Badge key={allergy} tone="danger">
                {allergy}
              </Badge>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Conditions">
        {patient.diseases.length === 0 ? (
          <p className="text-sm text-slate-400">None recorded.</p>
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

      <SectionCard title="Family history">
        {patient.familyHistory.length === 0 ? (
          <p className="text-sm text-slate-400">None recorded.</p>
        ) : (
          <ul className="space-y-2.5">
            {patient.familyHistory.map((entry) => (
              <li key={entry.id} className="rounded-xl bg-slate-50 p-3">
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
    </div>
  )
}
