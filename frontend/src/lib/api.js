/**
 * Single integration seam with the FastAPI backend.
 *
 * The read helpers below still resolve bundled demo data (shapes match
 * `backend/app/models.py`, so swapping them for `fetch` later needs no
 * component changes). `extractPrescription` and `createPrescription` are live.
 */
import { doctor, medicines, diseases, patients, prescriptions, timingSlots } from '../data/mock'

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

export const api = {
  getDoctor: () => doctor,
  listPatients: () => patients,
  getPatient: (id) => patients.find((p) => p.patient_id === Number(id)),
  listMedicines: () => medicines,
  listDiseases: () => diseases,
  listTimingSlots: () => timingSlots,
  listPrescriptions: () => prescriptions,
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
 * Persist a doctor-confirmed prescription. Returns the saved record, which
 * includes a `warnings` array of patient-safety notes (e.g. allergy clashes).
 */
export async function createPrescription(payload) {
  const response = await fetch(`${BASE}/prescriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw await readError(response)
  return response.json()
}
