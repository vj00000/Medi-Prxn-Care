/**
 * Single integration seam with the FastAPI backend.
 *
 * The read helpers below still resolve bundled demo data (shapes match
 * `backend/app/models.py`, so swapping them for `fetch` later needs no
 * component changes). `extractPrescription` is a live call today.
 */
import { doctor, medicines, diseases, patients, prescriptions, timingSlots } from '../data/mock'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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
 * Throws an Error carrying the API's `detail` message on failure (e.g. 503
 * when GEMINI_API_KEY is not configured).
 */
export async function extractPrescription(file) {
  const form = new FormData()
  form.append('file', file)

  const response = await fetch(`${BASE}/ai/extract`, { method: 'POST', body: form })
  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const body = await response.json()
      if (body?.detail) detail = body.detail
    } catch {
      // response was not JSON — keep the generic message
    }
    throw new Error(detail)
  }
  return response.json()
}
