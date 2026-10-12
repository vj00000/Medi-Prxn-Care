/**
 * Patient-portal data helpers.
 *
 * The portal is scoped to a single signed-in patient, so every page resolves
 * "me" through CURRENT_PATIENT_ID rather than trusting a route parameter.
 */

export const CURRENT_PATIENT_ID = 1

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
