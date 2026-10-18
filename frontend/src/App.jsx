import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Patients from './pages/Patients'
import PatientDetail from './pages/PatientDetail'
import Prescriptions from './pages/Prescriptions'
import Scan from './pages/Scan'
import NewPrescription from './pages/NewPrescription'
import Auth from './pages/Auth'
import PatientLayout from './patient/PatientLayout'
import PatientHome from './patient/pages/Home'
import PatientTimeline from './patient/pages/Timeline'
import PatientPrescriptions from './patient/pages/Prescriptions'
import PatientCart from './patient/pages/Cart'
import PatientProfile from './patient/pages/Profile'
import { useApp } from './store/AppStore'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
      Loading…
    </div>
  )
}

function RequireDoctor() {
  const { session, loading } = useApp()
  if (loading) return <LoadingScreen />
  if (session?.role !== 'doctor') return <Navigate to="/login" replace />
  return <Outlet />
}

function RequirePatient() {
  const { session, loading } = useApp()
  if (loading) return <LoadingScreen />
  if (session?.role !== 'patient') return <Navigate to="/login" replace />
  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/signup" element={<Auth mode="signup" />} />

        {/* Doctor portal */}
        <Route element={<RequireDoctor />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/patients/:id" element={<PatientDetail />} />
            <Route path="/patients/:id/prescribe" element={<NewPrescription />} />
            <Route path="/prescriptions" element={<Prescriptions />} />
            <Route path="/scan" element={<Scan />} />
          </Route>
        </Route>

        {/* Patient portal */}
        <Route element={<RequirePatient />}>
          <Route path="/patient" element={<PatientLayout />}>
            <Route index element={<PatientHome />} />
            <Route path="timeline" element={<PatientTimeline />} />
            <Route path="prescriptions" element={<PatientPrescriptions />} />
            <Route path="cart" element={<PatientCart />} />
            <Route path="profile" element={<PatientProfile />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
