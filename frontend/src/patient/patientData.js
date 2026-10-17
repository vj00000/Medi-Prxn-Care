/**
 * Patient-portal data helpers.
 *
 * The portal is scoped to a single signed-in patient, so every page resolves
 * "me" through CURRENT_PATIENT_ID rather than trusting a route parameter.
 */

export const CURRENT_PATIENT_ID = 1

/** How many days before a supply runs out a medicine is flagged to reorder. */
export const REORDER_WINDOW_DAYS = 5

/**
 * Whether a schedule is running out.
 *
 * Returns null when the medicine is not near its end date, otherwise
 * { level: 'now' | 'soon', days } so the UI can colour the badge.
 */
export function reorderStatus(schedule, now = new Date()) {
  if (!schedule?.end_date || schedule.is_expired) return null

  const end = new Date(`${schedule.end_date}T00:00:00`)
  if (Number.isNaN(end.getTime())) return null

  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((end - midnight) / 86_400_000)

  if (days < 0) return { level: 'now', days }
  if (days <= REORDER_WINDOW_DAYS) return { level: 'soon', days }
  return null
}

/** Today as an ISO date, matching what the API returns for checkup dates. */
export function todayIso(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** ISO date -> '17 Oct 2026', for display. */
export function formatLongDate(iso) {
  if (!iso) return null
  const parsed = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** '10:30:00' or '10:30' -> '10:30 AM'. */
export function formatTime(isoTime) {
  if (!isoTime) return null
  const [rawHour, rawMinute] = String(isoTime).split(':')
  const hour = Number(rawHour)
  if (!Number.isFinite(hour)) return null
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:${String(rawMinute ?? '00').padStart(2, '0')} ${suffix}`
}

/** Date and slot together: '31 Oct 2026, 10:30 AM'. */
export function formatCheckup(isoDate, isoTime) {
  const date = formatLongDate(isoDate)
  if (!date) return null
  const slot = formatTime(isoTime)
  return slot ? `${date}, ${slot}` : date
}

/** Hour of the appointment slot, or undefined when only a day was chosen. */
export function checkupHour(isoTime) {
  if (!isoTime) return undefined
  const hour = Number(String(isoTime).split(':')[0])
  return Number.isFinite(hour) ? hour : undefined
}

/** Builds a Tata 1mg medicine search link (no partnership implied). */
export function oneMgUrl(medicineName) {
  return `https://www.1mg.com/search/all?name=${encodeURIComponent(medicineName)}`
}

/**
 * Flattens prescriptions + conditions into a single chronological feed.
 * Order follows the source arrays (newest first).
 */
export function buildTimeline(patient, prescriptions) {
  if (!patient) return []

  const events = []

  prescriptions
    .filter((rx) => rx.patient_id === patient.patient_id)
    .forEach((rx) => {
      events.push({
        id: `rx-${rx.prescription_id}`,
        kind: 'prescription',
        title: 'Prescription issued',
        detail: rx.medicines.map((m) => `${m.name} ${m.dosage}`).join(', '),
        date: rx.created,
        status: rx.status,
      })
      if (rx.lab_test) {
        events.push({
          id: `lab-${rx.prescription_id}`,
          kind: 'lab',
          title: `Lab test · ${rx.lab_test}`,
          detail: 'Sample collected; awaiting doctor review',
          date: rx.created,
        })
      }
    })

  patient.diseases.forEach((disease) => {
    events.push({
      id: `dx-${disease.id}`,
      kind: 'condition',
      title: `Condition recorded · ${disease.name}`,
      detail: 'Added to your medical record',
      date: 'Recorded',
    })
  })

  return events
}

/**
 * Slot label -> clock hour.
 *
 * `MedicationSchedule.timing_slot` is a label ("Morning"), not a time, so a
 * reminder needs this mapping to know when to ring.
 *
 * "As needed" is deliberately absent: an SOS medicine must never ring. An
 * unmapped slot is treated the same way — silence rather than a wrong alarm.
 */
export const SLOT_TIMES = {
  morning: 8,
  afternoon: 14,
  evening: 18,
  night: 21,
}

/** The clock hour for a slot label, or undefined if it should never ring. */
export function slotHour(timingSlot) {
  return SLOT_TIMES[String(timingSlot ?? '').trim().toLowerCase()]
}

/**
 * Doses whose slot time has arrived today and that are not already marked as
 * taken.
 *
 * There is no upper window on purpose: a missed morning dose stays due until
 * it is acknowledged rather than silently expiring at noon, which is also what
 * makes the alarm demonstrable at any hour.
 */
export function dueDoses(schedules = [], taken = {}, now = new Date()) {
  const hour = now.getHours()
  return schedules.filter((item) => {
    if (item.is_expired || taken[item.id]) return false
    const slot = slotHour(item.timing_slot)
    return slot !== undefined && hour >= slot
  })
}
