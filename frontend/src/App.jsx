import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Patients from './pages/Patients'
import PatientDetail from './pages/PatientDetail'
import Prescriptions from './pages/Prescriptions'
import Scan from './pages/Scan'
import NewPrescription from './pages/NewPrescription'
import PatientLayout from './patient/PatientLayout'
import PatientHome from './patient/pages/Home'
import PatientTimeline from './patient/pages/Timeline'
import PatientPrescriptions from './patient/pages/Prescriptions'
import PatientProfile from './patient/pages/Profile'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Doctor portal */}
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/patients" element={<Patients />} />
          <Route path="/patients/:id" element={<PatientDetail />} />
          <Route path="/patients/:id/prescribe" element={<NewPrescription />} />
          <Route path="/prescriptions" element={<Prescriptions />} />
          <Route path="/scan" element={<Scan />} />
        </Route>

        {/* Patient portal */}
        <Route path="/patient" element={<PatientLayout />}>
          <Route index element={<PatientHome />} />
          <Route path="timeline" element={<PatientTimeline />} />
          <Route path="prescriptions" element={<PatientPrescriptions />} />
          <Route path="profile" element={<PatientProfile />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
