import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, approvePrescription, createPrescription } from '../lib/api'

const AppContext = createContext(null)

/** ISO date -> '17 Oct 2026'. Null passes through so the UI can omit it. */
function formatOptional(iso) {
  if (!iso) return null
  const parsed = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Normalise a prescription record for display. */
function present(rx) {
  return { ...rx, created: formatOptional(rx.created) ?? 'Date not recorded' }
}

/** Normalise a patient record for display. */
function presentPatient(patient) {
  return { ...patient, lastVisit: formatOptional(patient.lastVisit) }
}

export function AppProvider({ children }) {
  const [doctor, setDoctor] = useState(null)
  const [patients, setPatients] = useState([])
  const [medicines, setMedicines] = useState([])
  const [diseases, setDiseases] = useState([])
  const [prescriptions, setPrescriptions] = useState([])
  const [warnings, setWarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [doctorRow, patientRows, medicineRows, diseaseRows, rxRows] = await Promise.all([
          api.getDoctor(),
          api.listPatients(),
          api.listMedicines(),
          api.listDiseases(),
          api.listPrescriptions(),
        ])
        if (cancelled) return
        setDoctor(doctorRow)
        setPatients(patientRows.map(presentPatient))
        setMedicines(medicineRows)
        setDiseases(diseaseRows)
        setPrescriptions(rxRows.map(present))
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const approve = useCallback(async (id) => {
    const saved = await approvePrescription(id)
    setPrescriptions((prev) =>
      prev.map((rx) => (rx.prescription_id === id ? present(saved) : rx)),
    )
    return saved
  }, [])

  const value = useMemo(
    () => ({
      doctor,
      patients,
      medicines,
      diseases,
      timingSlots: api.listTimingSlots(),
      prescriptions,
      warnings,
      loading,
      error,
      clearWarnings: () => setWarnings([]),
      getPatient: (id) => patients.find((p) => p.patient_id === Number(id)),
      getPrescriptionsFor: (patientId) =>
        prescriptions.filter((rx) => rx.patient_id === Number(patientId)),

      /** Persists to the API, then reflects the saved record locally. */
      addPrescription: async (payload) => {
        const saved = await createPrescription(payload)
        const record = present(saved)
        setPrescriptions((prev) => [record, ...prev])
        setWarnings(saved.warnings ?? [])
        return record
      },

      approvePrescription: approve,
    }),
    [doctor, patients, medicines, diseases, prescriptions, warnings, loading, error, approve],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within <AppProvider>')
  return ctx
}
