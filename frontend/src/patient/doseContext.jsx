import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useApp } from '../store/AppStore'
import { CURRENT_PATIENT_ID, dueDoses, todayIso } from './patientData'

const DoseContext = createContext(null)

const CHECK_INTERVAL_MS = 30_000
const SNOOZE_MS = 10 * 60 * 1000

/** Date-scoped, so yesterday's doses do not suppress today's alarm. */
function storageKey() {
  return `smartrx:doses:${new Date().toISOString().slice(0, 10)}`
}

function loadTaken() {
  try {
    return JSON.parse(localStorage.getItem(storageKey()) ?? '{}')
  } catch {
    return {}
  }
}

const DISMISSED_CHECKUPS_KEY = 'smartrx:checkup-dismissed'

/** Keyed by checkup date, so dismissing today does not silence a later one. */
function loadDismissedCheckups() {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_CHECKUPS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/**
 * Owns everything the alarm needs: which doses are taken, and which dose (if
 * any) is currently ringing. Kept above the patient routes so the alarm
 * survives tab changes and Home can share the same "taken" state.
 */
export function DoseProvider({ children }) {
  const { patients, prescriptions } = useApp()
  const schedules =
    patients.find((p) => p.patient_id === CURRENT_PATIENT_ID)?.schedules ?? []

  const [taken, setTaken] = useState(loadTaken)
  const [ringing, setRinging] = useState(null)
  const [dismissedCheckups, setDismissedCheckups] = useState(loadDismissedCheckups)
  const snoozedUntil = useRef({})

  useEffect(() => {
    localStorage.setItem(storageKey(), JSON.stringify(taken))
  }, [taken])

  useEffect(() => {
    localStorage.setItem(DISMISSED_CHECKUPS_KEY, JSON.stringify(dismissedCheckups))
  }, [dismissedCheckups])

  const dismissCheckup = useCallback((iso) => {
    setDismissedCheckups((prev) => ({ ...prev, [iso]: true }))
  }, [])

  /** The patient's follow-up falls due today and has not been dismissed. */
  const checkup = useMemo(() => {
    const today = todayIso()
    const due = prescriptions.find(
      (rx) =>
        rx.patient_id === CURRENT_PATIENT_ID && rx.next_checkup_date === today,
    )
    return due && !dismissedCheckups[today] ? due : null
  }, [prescriptions, dismissedCheckups])

  const markTaken = useCallback((id) => {
    setTaken((prev) => ({ ...prev, [id]: true }))
    setRinging((current) => (current?.id === id ? null : current))
  }, [])

  const untake = useCallback((id) => {
    setTaken((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const dismissAlarm = useCallback(() => setRinging(null), [])

  const snooze = useCallback(() => {
    setRinging((current) => {
      if (current) snoozedUntil.current[current.id] = Date.now() + SNOOZE_MS
      return null
    })
  }, [])

  /** Demo trigger: ring the next outstanding dose regardless of the clock. */
  const ringNow = useCallback(() => {
    const target =
      schedules.find((item) => !taken[item.id] && item.timing_slot !== 'As needed') ??
      schedules[0]
    if (target) setRinging(target)
  }, [schedules, taken])

  useEffect(() => {
    const check = () => {
      setRinging((current) => {
        if (current) return current // already ringing — leave it alone
        return (
          dueDoses(schedules, taken).find(
            (item) => (snoozedUntil.current[item.id] ?? 0) <= Date.now(),
          ) ?? null
        )
      })
    }

    check() // catch a dose that came due while the tab was closed
    const id = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [schedules, taken])

  const value = useMemo(
    () => ({
      taken,
      markTaken,
      untake,
      ringing,
      dismissAlarm,
      snooze,
      ringNow,
      checkup,
      dismissCheckup,
    }),
    [
      taken,
      markTaken,
      untake,
      ringing,
      dismissAlarm,
      snooze,
      ringNow,
      checkup,
      dismissCheckup,
    ],
  )

  return <DoseContext.Provider value={value}>{children}</DoseContext.Provider>
}

export function useDoses() {
  const ctx = useContext(DoseContext)
  if (!ctx) throw new Error('useDoses must be used within <DoseProvider>')
  return ctx
}
