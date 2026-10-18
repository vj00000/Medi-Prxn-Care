import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  addFamilyMember,
  api,
  approvePrescription,
  authMe,
  createPatientPrescription,
  createPrescription,
  patientChat,
  setCheckup,
  setPrescriptionPrivacy,
  updatePatientPrescription,
} from '../lib/api'
import { clearSession, getSession, getToken, setSession, setToken } from '../lib/auth'

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
  const [session, setSessionState] = useState(() => getSession())
  const [doctor, setDoctor] = useState(() => session?.doctor ?? null)
  // The signed-in patient id (patient portal). Null in the doctor portal.
  const [patientId, setPatientId] = useState(() => session?.patient?.patient_id ?? null)
  const [patients, setPatients] = useState([])
  const [family, setFamily] = useState([])
  const [medicines, setMedicines] = useState([])
  const [diseases, setDiseases] = useState([])
  const [prescriptions, setPrescriptions] = useState([])
  const [warnings, setWarnings] = useState([])
  const [interactionNote, setInteractionNote] = useState(null)
  // Prescription draft shared between the form and the floating assistant.
  const [draft, setDraft] = useState({ diagnosis: '', medicines: [] })
  // Last patient the doctor opened, so the assistant keeps context off-patient pages.
  const [currentPatientId, setCurrentPatientId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const resetDraft = useCallback(() => {
    setDraft({ diagnosis: '', medicines: [] })
  }, [])

  const applySession = useCallback((next) => {
    setSession(next)
    setSessionState(next)
  }, [])

  const refreshFamily = useCallback(
    async (pid = patientId) => {
      if (pid == null) {
        setFamily([])
        return []
      }
      const rows = await api.getFamily(pid)
      setFamily(rows.map(presentPatient))
      return rows
    },
    [patientId],
  )

  // Hydrate identity from a stored token (page reload), then load catalog.
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const token = getToken()
        let doc = session?.doctor ?? null
        let pid = session?.patient?.patient_id ?? null

        if (token) {
          try {
            const me = await authMe(token)
            doc = me.doctor ?? null
            pid = me.patient?.patient_id ?? null
            applySession({ role: me.role, doctor: me.doctor ?? null, patient: me.patient ?? null })
          } catch {
            clearSession()
            applySession(null)
            doc = null
            pid = null
          }
        }

        const [patientRows, medicineRows, diseaseRows, rxRows, familyRows] =
          await Promise.all([
            api.listPatients(),
            api.listMedicines(),
            api.listDiseases(),
            api.listPrescriptions(),
            pid != null ? api.getFamily(pid) : Promise.resolve([]),
          ])
        if (cancelled) return
        setDoctor(doc)
        setPatientId(pid)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signInDoctor = useCallback((auth) => {
    setToken(auth.token)
    applySession({ role: 'doctor', doctor: auth.doctor ?? null, patient: null })
    setDoctor(auth.doctor ?? null)
    setPatientId(null)
    setCurrentPatientId(null)
  }, [applySession])

  const signInPatient = useCallback(
    (auth) => {
      setToken(auth.token)
      applySession({ role: 'patient', doctor: null, patient: auth.patient ?? null })
      setDoctor(null)
      const pid = auth.patient?.patient_id ?? null
      setPatientId(pid)
      refreshFamily(pid)
    },
    [applySession, refreshFamily],
  )

  const signOut = useCallback(() => {
    clearSession()
    applySession(null)
    setDoctor(null)
    setPatientId(null)
    setCurrentPatientId(null)
  }, [applySession])

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

  /** Record the follow-up slot the patient picked. */
  const setCheckupDate = useCallback(
    async (id, isoDate, isoTime = null) => {
      const saved = await setCheckup(id, isoDate, isoTime)
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

  /** A prescription the signed-in patient reports for themselves. */
  const addSelfPrescription = useCallback(
    async (payload) => {
      const saved = await createPatientPrescription(payload)
      const record = present(saved)
      setPrescriptions((prev) => [record, ...prev])
      await refreshFamily()
      return record
    },
    [refreshFamily],
  )

  /** Edit a self-reported prescription; doctor-issued ones are locked server-side. */
  const updateSelfPrescription = useCallback(
    async (id, payload) => {
      const saved = await updatePatientPrescription(id, payload)
      applyPrescription(saved)
      await refreshFamily()
      return saved
    },
    [applyPrescription, refreshFamily],
  )

  /** Ask the patient-side assistant to (for example) book a follow-up. */
  const consultAssistant = useCallback(
    async (message) => {
      if (patientId == null) throw new Error('Not signed in as a patient.')
      const result = await patientChat(patientId, message)
      const rows = await api.listPrescriptions()
      setPrescriptions(rows.map(present))
      await refreshFamily()
      return result
    },
    [patientId, refreshFamily],
  )

  const value = useMemo(
    () => ({
      session,
      doctor,
      patientId,
      patients,
      family,
      medicines,
      diseases,
      timingSlots: api.listTimingSlots(),
      prescriptions,
      warnings,
      interactionNote,
      draft,
      setDraft,
      resetDraft,
      currentPatientId,
      setCurrentPatientId,
      loading,
      error,
      signInDoctor,
      signInPatient,
      signOut,
      clearWarnings: () => {
        setWarnings([])
        setInteractionNote(null)
      },
      getPatient: (id) => patients.find((p) => p.patient_id === Number(id)),
      getPrescriptionsFor: (patientId) =>
        prescriptions.filter((rx) => rx.patient_id === Number(patientId)),

      /** Persists to the API, then reflects the saved record locally. */
      addPrescription: async (payload) => {
        const saved = await createPrescription(payload)
        const record = present(saved)
        setPrescriptions((prev) => [record, ...prev])
        setWarnings(saved.warnings ?? [])
        setInteractionNote(saved.interaction_note ?? null)
        await refreshFamily()
        return record
      },

      approvePrescription: approve,
      togglePrivacy,
      setCheckupDate,
      addMember,
      addSelfPrescription,
      updateSelfPrescription,
      refreshFamily,
      consultAssistant,
    }),
    [
      session,
      doctor,
      patientId,
      patients,
      family,
      medicines,
      diseases,
      prescriptions,
      warnings,
      interactionNote,
      draft,
      resetDraft,
      currentPatientId,
      loading,
      error,
      signInDoctor,
      signInPatient,
      signOut,
      approve,
      togglePrivacy,
      setCheckupDate,
      addMember,
      addSelfPrescription,
      updateSelfPrescription,
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
