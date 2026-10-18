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
import { markDoseTaken, untakeDose } from '../lib/api'
import { checkupHour, dueDoses, todayIso } from './patientData'

const DoseContext = createContext(null)

const CHECK_INTERVAL_MS = 30_000
const SNOOZE_MS = 10 * 60 * 1000

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
 *
 * Taken state lives in the database, not localStorage: a dose recorded on one
 * device must not ring on another, and the stock count has to be authoritatively
 * decremented exactly once. The schedule rows carry `taken_today` and
 * `taken_at`, so this context only needs to trigger a refresh.
 */
export function DoseProvider({ children }) {
  const { patients, prescriptions, refreshFamily, patientId } = useApp()
  const selected = patients.find((p) => p.patient_id === patientId)
  const schedules = selected?.schedules ?? []
  const today = todayIso()
  const [optimisticTaken, setOptimisticTaken] = useState({})

  /** schedule id -> taken_at, built from the server's own record. */
  const taken = useMemo(
    () => ({
      ...Object.fromEntries(
        schedules
          .filter((schedule) => schedule.taken_today)
          .map((schedule) => [schedule.id, schedule.taken_at ?? true]),
      ),
      ...Object.fromEntries(
        Object.entries(optimisticTaken)
          .filter(([, doseDate]) => doseDate === today)
          .map(([id]) => [id, true]),
      ),
    }),
    [optimisticTaken, schedules, today],
  )

  const [ringing, setRinging] = useState(null)
  const [dismissedCheckups, setDismissedCheckups] = useState(loadDismissedCheckups)
  const snoozedUntil = useRef({})
  const [busy, setBusy] = useState({})

  useEffect(() => {
    localStorage.setItem(DISMISSED_CHECKUPS_KEY, JSON.stringify(dismissedCheckups))
  }, [dismissedCheckups])

  const dismissCheckup = useCallback((iso) => {
    setDismissedCheckups((prev) => ({ ...prev, [iso]: true }))
  }, [])

  /** The patient's follow-up falls due today and has not been dismissed. */
  const checkup = useMemo(() => {
    const now = new Date()
    const today = todayIso(now)
    const due = prescriptions.find(
      (rx) =>
        rx.patient_id === patientId && rx.next_checkup_date === today,
    )
    if (!due || dismissedCheckups[today]) return null
    // With a slot time, stay quiet until the appointment hour arrives.
    const hour = checkupHour(due.next_checkup_time)
    return hour !== undefined && now.getHours() < hour ? null : due
  }, [prescriptions, dismissedCheckups, patientId])

  const markTaken = useCallback(
    async (id) => {
      setRinging((current) => (current?.id === id ? null : current))
      setOptimisticTaken((prev) => ({ ...prev, [id]: today }))
      setBusy((prev) => ({ ...prev, [id]: true }))
      try {
        await markDoseTaken(patientId, id)
        // Refetch so stock and taken_today come from the server, not a guess.
        await refreshFamily()
      } catch (error) {
        setOptimisticTaken((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        throw error
      } finally {
        setBusy((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    },
    [refreshFamily, patientId, today],
  )

  const untake = useCallback(
    async (id) => {
      setOptimisticTaken((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setBusy((prev) => ({ ...prev, [id]: true }))
      try {
        await untakeDose(patientId, id)
        await refreshFamily()
      } finally {
        setBusy((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    },
    [refreshFamily, patientId],
  )

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
      busy,
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
      busy,
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
