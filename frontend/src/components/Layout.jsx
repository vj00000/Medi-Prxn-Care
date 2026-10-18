import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { FileText, LayoutDashboard, LogOut, QrCode, Users } from 'lucide-react'
import { useApp } from '../store/AppStore'
import ChatWidget from './ChatWidget'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/scan', label: 'Scan QR', icon: QrCode },
  { to: '/prescriptions', label: 'Prescriptions', icon: FileText },
]

function titleFor(pathname) {
  if (pathname.endsWith('/prescribe')) return 'New prescription'
  if (pathname.startsWith('/patients/')) return 'Patient record'
  if (pathname.startsWith('/patients')) return 'Patients'
  if (pathname.startsWith('/prescriptions')) return 'Prescriptions'
  if (pathname.startsWith('/scan')) return 'Scan patient QR'
  return 'Dashboard'
}

function initialsOf(name) {
  // `doctor` is null until the initial fetch resolves.
  if (!name) return '…'
  return name
    .replace(/^Dr\.\s*/i, '')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function Layout() {
  const { doctor, setCurrentPatientId, signOut } = useApp()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const initials = initialsOf(doctor?.name)

  function handleSignOut() {
    signOut()
    navigate('/login', { replace: true })
  }

  // Remember the patient being viewed so the assistant keeps context even on
  // pages without a patient in the URL.
  useEffect(() => {
    const match = pathname.match(/\/patients\/(\d+)/)
    if (match) setCurrentPatientId(Number(match[1]))
  }, [pathname, setCurrentPatientId])

  const navClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-800'
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <img src="/logo.png" alt="" className="h-10 w-auto rounded-lg" />
          <div>
            <p className="text-base font-bold tracking-tight text-slate-900">Medi-Prxn-Care</p>
            <p className="text-xs font-medium text-slate-400">Doctor Portal</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="m-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{doctor?.name}</p>
              <p className="truncate text-xs text-slate-500">{doctor?.specialization}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-6 lg:px-8">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              {titleFor(pathname)}
            </h1>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="hidden sm:inline">{doctor?.name}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
                {initials}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign out"
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>

          {/* Compact navigation for small screens (sidebar is desktop-only). */}
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 lg:hidden">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600'
                  }`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-8 lg:px-8">
          <Outlet />
        </main>
      </div>

      <ChatWidget />
    </div>
  )
}
