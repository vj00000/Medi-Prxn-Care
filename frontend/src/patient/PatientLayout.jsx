import { NavLink, Outlet } from 'react-router-dom'
import { ClipboardList, HeartPulse, History, ShoppingCart, User } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { CURRENT_PATIENT_ID } from './patientData'
import { CartProvider } from './cartContext'
import { DoseProvider } from './doseContext'
import DoseAlarm from './components/DoseAlarm'

const TABS = [
  { to: '/patient', label: 'Home', icon: HeartPulse, end: true },
  { to: '/patient/timeline', label: 'Timeline', icon: History },
  { to: '/patient/prescriptions', label: 'Meds', icon: ClipboardList },
  { to: '/patient/cart', label: 'Cart', icon: ShoppingCart },
  { to: '/patient/profile', label: 'Profile', icon: User },
]

function initials(name) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function PatientLayout() {
  return (
    <CartProvider>
      <DoseProvider>
        <PatientShell />
      </DoseProvider>
    </CartProvider>
  )
}

function PatientShell() {
  const { patients } = useApp()
  const patient = patients.find((p) => p.patient_id === CURRENT_PATIENT_ID)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white">
              <HeartPulse size={18} />
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight text-slate-900">SmartRx</p>
              <p className="text-[11px] font-medium text-slate-400">Patient</p>
            </div>
          </div>
          {patient && (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
              {initials(patient.name)}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 pb-28 pt-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center px-2 py-1.5">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-brand-700' : 'text-slate-400 hover:text-slate-600'
                }`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <DoseAlarm />
    </div>
  )
}
