import { createContext, useContext, useMemo, useState } from 'react'
import { api, createPrescription } from '../lib/api'

const AppContext = createContext(null)

function today() {
  return new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function AppProvider({ children }) {
  const [prescriptions, setPrescriptions] = useState(() => api.listPrescriptions())
  const [warnings, setWarnings] = useState([])

  const value = useMemo(
    () => ({
      doctor: api.getDoctor(),
      patients: api.listPatients(),
      medicines: api.listMedicines(),
      diseases: api.listDiseases(),
      timingSlots: api.listTimingSlots(),
      prescriptions,
      warnings,
      clearWarnings: () => setWarnings([]),
      getPatient: (id) => api.getPatient(id),
      getPrescriptionsFor: (patientId) =>
        prescriptions.filter((rx) => rx.patient_id === Number(patientId)),

      /** Persists to the API, then reflects the saved record locally. */
      addPrescription: async (payload) => {
        const saved = await createPrescription(payload)
        const record = { ...saved, created: today() }
        setPrescriptions((prev) => [record, ...prev])
        setWarnings(saved.warnings ?? [])
        return record
      },

      approvePrescription: (id) =>
        setPrescriptions((prev) =>
          prev.map((rx) =>
            rx.prescription_id === id ? { ...rx, status: 'approved' } : rx,
          ),
        ),
    }),
    [prescriptions, warnings],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within <AppProvider>')
  return ctx
}
