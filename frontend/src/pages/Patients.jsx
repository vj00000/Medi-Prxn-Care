import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Search } from 'lucide-react'
import { useApp } from '../store/AppStore'
import Badge from '../components/Badge'

function initials(name) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function Patients() {
  const { patients } = useApp()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return patients
    return patients.filter((p) =>
      [p.name, p.qr_token, ...p.allergies, ...p.diseases.map((d) => d.name)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [patients, query])

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        {filtered.length} of {patients.length} patients
      </p>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="field pl-10"
          placeholder="Search by name, condition or QR token…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          No patients match “{query}”.
        </div>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {filtered.map((patient) => (
            <li key={patient.patient_id}>
              <Link
                to={`/patients/${patient.patient_id}`}
                className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-slate-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                  {initials(patient.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{patient.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {patient.age} yrs · {patient.gender}
                  </p>
                </div>
                <div className="hidden flex-wrap gap-1.5 md:flex">
                  {patient.diseases.map((disease) => (
                    <Badge key={disease.id} tone="brand">
                      {disease.name}
                    </Badge>
                  ))}
                </div>
                {patient.allergies.length > 0 && <Badge tone="danger">Allergy</Badge>}
                <ChevronRight size={16} className="shrink-0 text-slate-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
