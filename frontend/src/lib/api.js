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

async function patch(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await readError(response)
  return response.json()
}

async function del(path) {
  const response = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!response.ok) throw await readError(response)
  return response.json()
}

/** Record today's dose for one schedule. The server is idempotent. */
export const markDoseTaken = (patientId, scheduleId) =>
  post(`/patients/${patientId}/doses/${scheduleId}/taken`)

/** Undo today's dose, returning the unit to stock. */
export const untakeDose = (patientId, scheduleId) =>
  del(`/patients/${patientId}/doses/${scheduleId}/taken`)

/** Medicines at or below their reorder threshold, most urgent first. */
export const getLowStock = (patientId) =>
  get(`/patients/${patientId}/low-stock`)

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

// --------------------------------------------------------------------------- //
// Auth / onboarding
// --------------------------------------------------------------------------- //

/** Attach a bearer token, for the few endpoints that need identity. */
async function authorizedGet(path, token) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw await readError(response)
  return response.json()
}

export const doctorSignup = (payload) => post('/auth/doctor/signup', payload)
export const doctorLogin = (payload) => post('/auth/doctor/login', payload)
export const patientSignup = (payload) => post('/auth/patient/signup', payload)
export const patientLogin = (payload) => post('/auth/patient/login', payload)
export const authMe = (token) => authorizedGet('/auth/me', token)

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

/** Turn spoken or typed text into a structured medicine list. */
export const parseNote = (text) => post('/ai/parse-note', { text })

/**
 * Ask the prescribing assistant to change the draft or answer questions about
 * a patient. Returns { draft, reply, actions } — `draft` is the updated
 * prescription. Pass `patient_id` to let the assistant answer from that
 * patient's record.
 */
export async function chatWithDraft({ draft, message, history = [], patient_id = null }) {
  const response = await fetch(`${BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft, message, history, patient_id }),
  })
  if (!response.ok) throw await readError(response)
  return response.json()
}

/**
 * Persist a doctor-confirmed prescription. Returns the saved record, which
 * includes a `warnings` array of patient-safety notes (e.g. allergy clashes).
 */
export const createPrescription = (payload) => post('/prescriptions', payload)

/** A prescription the patient records for themselves (no doctor). */
export const createPatientPrescription = (payload) => post('/prescriptions/self', payload)

/** Edit a self-reported prescription; doctor-issued ones are rejected by the API. */
export const updatePatientPrescription = (id, payload) =>
  patch(`/prescriptions/${id}/self`, payload)

/** Safety-check a draft (allergy clashes + drug interactions) without saving. */
export const checkInteractions = (payload) => post('/prescriptions/interactions', payload)

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

/** Slots a doctor can still take on one day. */
export function getAvailability(doctorId, isoDate, excludePrescriptionId = null) {
  const params = new URLSearchParams({ date: isoDate })
  if (excludePrescriptionId != null) params.set('exclude', excludePrescriptionId)
  return get(`/doctors/${doctorId}/availability?${params.toString()}`)
}

/** Record the follow-up slot the patient picked. */
export const setCheckup = (id, isoDate, isoTime = null) =>
  post(`/prescriptions/${id}/checkup`, {
    next_checkup_date: isoDate,
    next_checkup_time: isoTime,
  })

/** Patient-side assistant: "book my checkup in two weeks". */
export const patientChat = (patientId, message) =>
  post('/ai/patient-chat', { patient_id: patientId, message })

/** Ask the patient assistant anything about the patient or their family. */
export const patientAssistant = (patientId, message, history = []) =>
  post('/ai/patient-assistant', { patient_id: patientId, message, history })

/** Known interactions among the patient's own active medicines. */
export const getPatientInteractions = (patientId) =>
  get(`/patients/${patientId}/interactions`)
