/**
 * Single integration seam with the FastAPI backend.
 *
 * Today every function resolves the bundled demo data. When the backend
 * routers land, replace each body with a `fetch(`${BASE}${path}`)` call —
 * the shapes already match `backend/app/models.py`, so no component changes.
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
  // `post` helpers will become POST calls once the API exists.
  // eslint-disable-next-line no-unused-vars
  baseUrl: BASE,
}
