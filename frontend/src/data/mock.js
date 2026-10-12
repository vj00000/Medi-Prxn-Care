/**
 * Demo data for the doctor portal.
 *
 * The shapes mirror `backend/app/models.py` exactly (same field names, same
 * relationships) so that swapping this for real API responses later does not
 * require reshaping any component. Names line up with `backend/app/seed_db.py`.
 */

export const doctor = {
  doctor_id: 1,
  name: 'Dr. Ananya Sharma',
  specialization: 'Cardiologist',
  gender: 'female',
  contact_number: '+91-9876543210',
}

export const diseases = [
  { id: 1, name: 'Type 2 Diabetes Mellitus', isTransmittable: false, isInheritable: true },
  { id: 2, name: 'Influenza', isTransmittable: true, isInheritable: false },
  { id: 3, name: 'Hypertension', isTransmittable: false, isInheritable: true },
  { id: 4, name: 'Bronchial Asthma', isTransmittable: false, isInheritable: true },
]

export const medicines = [
  { id: 1, name: 'Paracetamol', brand: 'Crocin' },
  { id: 2, name: 'Metformin', brand: 'Glycomet' },
  { id: 3, name: 'Atorvastatin', brand: 'Lipitor' },
  { id: 4, name: 'Amoxicillin', brand: 'Mox' },
  { id: 5, name: 'Azithromycin', brand: 'Azithral' },
  { id: 6, name: 'Amlodipine', brand: 'Amlong' },
]

export const patients = [
  {
    patient_id: 1,
    name: 'Vikram Rao',
    age: 45,
    gender: 'male',
    allergies: ['Penicillin', 'Sulfa drugs'],
    qr_token: 'QR-VIKRAM-0001',
    phone: '+91-90000-11111',
    lastVisit: '12 Oct 2026',
    diseases: [
      { id: 1, name: 'Type 2 Diabetes Mellitus' },
      { id: 3, name: 'Hypertension' },
    ],
    familyHistory: [
      {
        id: 1,
        relation: 'Father',
        condition_name: 'Type 2 Diabetes Mellitus',
        additional_notes: 'Diagnosed at age 50',
      },
    ],
    schedules: [
      { id: 1, medicine_name: 'Metformin', dosage: '500 mg', timing_slot: 'Morning', is_expired: false },
      { id: 2, medicine_name: 'Atorvastatin', dosage: '10 mg', timing_slot: 'Night', is_expired: false },
    ],
  },
  {
    patient_id: 2,
    name: 'Meera Nair',
    age: 32,
    gender: 'female',
    allergies: [],
    qr_token: 'QR-MEERA-0002',
    phone: '+91-90000-22222',
    lastVisit: '11 Oct 2026',
    diseases: [{ id: 2, name: 'Influenza' }],
    familyHistory: [],
    schedules: [
      { id: 3, medicine_name: 'Paracetamol', dosage: '650 mg', timing_slot: 'As needed', is_expired: false },
    ],
  },
  {
    patient_id: 3,
    name: 'Arjun Patel',
    age: 58,
    gender: 'male',
    allergies: ['Aspirin'],
    qr_token: 'QR-ARJUN-0003',
    phone: '+91-90000-33333',
    lastVisit: '08 Oct 2026',
    diseases: [{ id: 3, name: 'Hypertension' }],
    familyHistory: [
      { id: 2, relation: 'Mother', condition_name: 'Hypertension', additional_notes: 'On medication since 2015' },
    ],
    schedules: [
      { id: 4, medicine_name: 'Amlodipine', dosage: '5 mg', timing_slot: 'Morning', is_expired: false },
    ],
  },
  {
    patient_id: 4,
    name: 'Sara Khan',
    age: 29,
    gender: 'female',
    allergies: ['Latex'],
    qr_token: 'QR-SARA-0004',
    phone: '+91-90000-44444',
    lastVisit: '05 Oct 2026',
    diseases: [{ id: 4, name: 'Bronchial Asthma' }],
    familyHistory: [],
    schedules: [],
  },
]

export const prescriptions = [
  {
    prescription_id: 1,
    patient_id: 1,
    status: 'review',
    created: '12 Oct 2026',
    lab_test: 'HbA1c',
    transcript: 'Metformin 500mg BD after meals; Atorvastatin 10mg at night',
    medicines: [
      { medicine_id: 2, name: 'Metformin', dosage: '500 mg', timings: 'Twice daily after meals', is_active: true },
      { medicine_id: 3, name: 'Atorvastatin', dosage: '10 mg', timings: 'Once at night', is_active: true },
    ],
  },
  {
    prescription_id: 2,
    patient_id: 3,
    status: 'approved',
    created: '08 Oct 2026',
    lab_test: null,
    transcript: 'Amlodipine 5mg once daily in the morning',
    medicines: [
      { medicine_id: 6, name: 'Amlodipine', dosage: '5 mg', timings: 'Once daily morning', is_active: true },
    ],
  },
  {
    prescription_id: 3,
    patient_id: 2,
    status: 'review',
    created: '11 Oct 2026',
    lab_test: 'CBC',
    transcript: 'Paracetamol 650mg SOS for fever',
    medicines: [
      { medicine_id: 1, name: 'Paracetamol', dosage: '650 mg', timings: 'As needed', is_active: true },
    ],
  },
]

export const timingSlots = ['Morning', 'Afternoon', 'Evening', 'Night', 'As needed']
