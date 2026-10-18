import { ClipboardList, FlaskConical, Stethoscope } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import SectionCard from '../../components/SectionCard'
import Badge from '../../components/Badge'
import { buildTimeline } from '../patientData'

const ICONS = {
  prescription: ClipboardList,
  lab: FlaskConical,
  condition: Stethoscope,
}

export default function Timeline() {
  const { patients, prescriptions, patientId } = useApp()
  const patient = patients.find((p) => p.patient_id === patientId)
  const events = buildTimeline(patient, prescriptions)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Your timeline</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          A record of your visits, prescriptions and tests.
        </p>
      </div>

      {events.length === 0 ? (
        <SectionCard>
          <p className="text-sm text-slate-400">Nothing recorded yet.</p>
        </SectionCard>
      ) : (
        <ol className="space-y-4">
          {events.map((event) => {
            const Icon = ICONS[event.kind] ?? Stethoscope
            return (
              <li key={event.id} className="flex gap-3">
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                  <Icon size={15} />
                </span>
                <div className="card flex-1 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                    {event.status && (
                      <Badge tone={event.status === 'approved' ? 'approved' : 'review'}>
                        {event.status === 'approved' ? 'Approved' : 'In review'}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{event.detail}</p>
                  <p className="mt-1.5 text-[11px] font-medium text-slate-400">{event.date}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
