import { createContext, useContext, useMemo, useState } from 'react'
import { api } from '../lib/api'

const AppContext = createContext(null)

let nextPrescriptionId = 100

export function AppProvider({ children }) {
  const [prescriptions, setPrescriptions] = useState(() => api.listPrescriptions())

  const value = useMemo(
    () => ({
      doctor: api.getDoctor(),
      patients: api.listPatients(),
      medicines: api.listMedicines(),
      diseases: api.listDiseases(),
      timingSlots: api.listTimingSlots(),
      prescriptions,
      getPatient: (id) => api.getPatient(id),
      getPrescriptionsFor: (patientId) =>
        prescriptions.filter((rx) => rx.patient_id === Number(patientId)),
      addPrescription: (prescription) => {
        const record = { ...prescription, prescription_id: nextPrescriptionId++ }
        setPrescriptions((prev) => [record, ...prev])
        return record
      },
      approvePrescription: (id) =>
        setPrescriptions((prev) =>
          prev.map((rx) =>
            rx.prescription_id === id ? { ...rx, status: 'approved' } : rx,
          ),
        ),
    }),
    [prescriptions],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within <AppProvider>')
  return ctx
}
