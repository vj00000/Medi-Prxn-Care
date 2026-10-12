import { Link } from 'react-router-dom'
import { ChevronRight, ClipboardList, Pill, Users } from 'lucide-react'
import { useApp } from '../store/AppStore'
import StatCard from '../components/StatCard'
import SectionCard from '../components/SectionCard'
import Badge from '../components/Badge'

function initials(name) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function Dashboard() {
  const { doctor, patients, prescriptions } = useApp()

  const awaiting = prescriptions.filter((rx) => rx.status === 'review').length
  const activeMeds = patients.reduce(
    (total, p) => total + p.schedules.filter((s) => !s.is_expired).length,
    0,
  )
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-slate-500">{today}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Welcome back, {doctor.name}
        </h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={ClipboardList} label="Awaiting review" value={awaiting} hint="Prescriptions to approve" />
        <StatCard icon={Users} label="Patients" value={patients.length} hint="Under your care" />
        <StatCard icon={Pill} label="Active medications" value={activeMeds} hint="Across all schedules" />
      </div>

      <SectionCard title="Recent patients">
        <ul className="divide-y divide-slate-100">
          {patients.map((patient) => (
            <li key={patient.patient_id}>
              <Link
                to={`/patients/${patient.patient_id}`}
                className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3.5 transition-colors hover:bg-slate-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                  {initials(patient.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{patient.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {patient.age} yrs · {patient.gender} · Last visit {patient.lastVisit}
                  </p>
                </div>
                {patient.allergies.length > 0 && <Badge tone="danger">Allergy</Badge>}
                <span className="hidden shrink-0 text-xs text-slate-400 sm:block">
                  {patient.diseases[0]?.name}
                </span>
                <ChevronRight size={16} className="shrink-0 text-slate-300" />
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}
