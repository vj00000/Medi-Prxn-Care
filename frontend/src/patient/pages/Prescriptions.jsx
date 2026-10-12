import { ExternalLink, FlaskConical } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import SectionCard from '../../components/SectionCard'
import { StatusBadge } from '../../components/Badge'
import { CURRENT_PATIENT_ID, oneMgUrl } from '../patientData'

export default function Prescriptions() {
  const { patients, prescriptions } = useApp()
  const patient = patients.find((p) => p.patient_id === CURRENT_PATIENT_ID)
  const mine = prescriptions.filter((rx) => rx.patient_id === CURRENT_PATIENT_ID)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Prescriptions</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Your prescribed medicines and where to buy them.
        </p>
      </div>

      {mine.length === 0 ? (
        <SectionCard>
          <p className="text-sm text-slate-400">No prescriptions yet.</p>
        </SectionCard>
      ) : (
        mine.map((rx) => (
          <SectionCard
            key={rx.prescription_id}
            title={rx.created}
            action={<StatusBadge status={rx.status} />}
          >
            <ul className="space-y-3">
              {rx.medicines.map((medicine, index) => (
                <li key={index} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {medicine.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {medicine.dosage} · {medicine.timings}
                    </p>
                  </div>
                  <a
                    href={oneMgUrl(medicine.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Buy on Tata 1mg
                    <ExternalLink size={13} />
                  </a>
                </li>
              ))}
            </ul>

            {rx.lab_test && (
              <p className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500">
                <FlaskConical size={14} /> Lab test: {rx.lab_test}
              </p>
            )}
          </SectionCard>
        ))
      )}

      {patient && (
        <p className="px-1 text-[11px] leading-relaxed text-slate-400">
          “Buy on Tata 1mg” opens a medicine search on 1mg.com in a new tab. Always confirm with
          your doctor or pharmacist before purchasing.
        </p>
      )}
    </div>
  )
}
