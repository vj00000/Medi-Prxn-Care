import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  addFamilyMember,
  api,
  approvePrescription,
  createPrescription,
  patientChat,
  setCheckup,
  setPrescriptionPrivacy,
} from '../lib/api'
import { CURRENT_PATIENT_ID } from '../patient/patientData'

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
  const [family, setFamily] = useState([])
  const [medicines, setMedicines] = useState([])
  const [diseases, setDiseases] = useState([])
  const [prescriptions, setPrescriptions] = useState([])
  const [warnings, setWarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshFamily = useCallback(async () => {
    const rows = await api.getFamily(CURRENT_PATIENT_ID)
    setFamily(rows.map(presentPatient))
    return rows
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [doctorRow, patientRows, familyRows, medicineRows, diseaseRows, rxRows] =
          await Promise.all([
            api.getDoctor(),
            api.listPatients(),
            api.getFamily(CURRENT_PATIENT_ID),
            api.listMedicines(),
            api.listDiseases(),
            api.listPrescriptions(),
          ])
        if (cancelled) return
        setDoctor(doctorRow)
        setPatients(patientRows.map(presentPatient))
        setFamily(familyRows.map(presentPatient))
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

  const applyPrescription = useCallback((saved) => {
    setPrescriptions((prev) =>
      prev.map((rx) =>
        rx.prescription_id === saved.prescription_id ? present(saved) : rx,
      ),
    )
  }, [])

  const approve = useCallback(
    async (id) => {
      const saved = await approvePrescription(id)
      applyPrescription(saved)
      return saved
    },
    [applyPrescription],
  )

  /** Hide or reveal one of my prescriptions for the rest of the family. */
  const togglePrivacy = useCallback(
    async (id, isPrivate) => {
      const saved = await setPrescriptionPrivacy(id, isPrivate)
      applyPrescription(saved)
      await refreshFamily()
      return saved
    },
    [applyPrescription, refreshFamily],
  )

  /** Record the follow-up date picked in Calendly. */
  const setCheckupDate = useCallback(
    async (id, isoDate) => {
      const saved = await setCheckup(id, isoDate)
      applyPrescription(saved)
      await refreshFamily()
      return saved
    },
    [applyPrescription, refreshFamily],
  )

  const addMember = useCallback(
    async (payload) => {
      const member = await addFamilyMember(payload)
      await refreshFamily()
      return member
    },
    [refreshFamily],
  )

  /** Ask the patient-side assistant to (for example) book a follow-up. */
  const consultAssistant = useCallback(
    async (message) => {
      const result = await patientChat(CURRENT_PATIENT_ID, message)
      const rows = await api.listPrescriptions()
      setPrescriptions(rows.map(present))
      await refreshFamily()
      return result
    },
    [refreshFamily],
  )

  const value = useMemo(
    () => ({
      doctor,
      patients,
      family,
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
        await refreshFamily()
        return record
      },

      approvePrescription: approve,
      togglePrivacy,
      setCheckupDate,
      addMember,
      refreshFamily,
      consultAssistant,
    }),
    [
      doctor,
      patients,
      family,
      medicines,
      diseases,
      prescriptions,
      warnings,
      loading,
      error,
      approve,
      togglePrivacy,
      setCheckupDate,
      addMember,
      refreshFamily,
      consultAssistant,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within <AppProvider>')
  return ctx
}
