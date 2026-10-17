/**
 * Single integration seam with the FastAPI backend.
 *
 * Everything below is served from Postgres. `timingSlots` is the one exception:
 * it is a controlled vocabulary of allowed slot labels rather than data, so it
 * stays a local constant — deriving it from `medication_schedules` would render
 * an empty dropdown on a database with no schedules yet.
 */
import { timingSlots } from '../data/mock'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/** Pull the API's `detail` message out of a failed response. */
async function readError(response) {
  let detail = `Request failed (${response.status})`
  try {
    const body = await response.json()
    if (body?.detail) detail = body.detail
  } catch {
    // response was not JSON — keep the generic message
  }
  return new Error(detail)
}

async function get(path) {
  const response = await fetch(`${BASE}${path}`)
  if (!response.ok) throw await readError(response)
  return response.json()
}

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await readError(response)
  return response.json()
}

export const api = {
  /** The prescribing doctor — the first row of `doctors`. */
  getDoctor: async () => (await get('/doctors'))[0] ?? null,
  listPatients: () => get('/patients'),
  /** The viewer plus everyone else in their household (privacy applied). */
  getFamily: (patientId) => get(`/patients/${patientId}/family`),
  listMedicines: () => get('/medicines'),
  listDiseases: () => get('/diseases'),
  listPrescriptions: () => get('/prescriptions'),
  listTimingSlots: () => timingSlots,
  baseUrl: BASE,
}

/**
 * Upload a case-paper / prescription image; the backend asks Gemini to read
 * it and returns a structured draft:
 *   { draft: { patient_name, diagnosis, lab_tests, medicines: [...] } }
 */
export async function extractPrescription(file) {
  const form = new FormData()
  form.append('file', file)

  const response = await fetch(`${BASE}/ai/extract`, { method: 'POST', body: form })
  if (!response.ok) throw await readError(response)
  return response.json()
}

/**
 * Ask the prescribing assistant to change the draft.
 * Returns { draft, reply, actions } — `draft` is the updated prescription.
 */
export async function chatWithDraft({ draft, message, history = [] }) {
  const response = await fetch(`${BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft, message, history }),
  })
  if (!response.ok) throw await readError(response)
  return response.json()
}

/**
 * Persist a doctor-confirmed prescription. Returns the saved record, which
 * includes a `warnings` array of patient-safety notes (e.g. allergy clashes).
 */
export const createPrescription = (payload) => post('/prescriptions', payload)

/** Move a prescription to `approved` in the database. */
export const approvePrescription = (id) => post(`/prescriptions/${id}/approve`)

/** Add a family member (father / mother / other) to a household. */
export const addFamilyMember = (payload) => post('/patients/family-members', payload)

/** Hide or reveal a prescription for the rest of the family. */
export async function setPrescriptionPrivacy(id, isPrivate) {
  const response = await fetch(`${BASE}/prescriptions/${id}/privacy`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_private: isPrivate }),
  })
  if (!response.ok) throw await readError(response)
  return response.json()
}

/** Record the follow-up slot the patient picked (Calendly or by hand). */
export const setCheckup = (id, isoDate, isoTime = null) =>
  post(`/prescriptions/${id}/checkup`, {
    next_checkup_date: isoDate,
    next_checkup_time: isoTime,
  })

/** Patient-side assistant: "book my checkup in two weeks". */
export const patientChat = (patientId, message) =>
  post('/ai/patient-chat', { patient_id: patientId, message })
