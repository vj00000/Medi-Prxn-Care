import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  FlaskConical,
  Lock,
  Pencil,
  Plus,
  ShoppingCart,
  Unlock,
} from 'lucide-react'
import { useApp } from '../../store/AppStore'
import SectionCard from '../../components/SectionCard'
import Badge, { StatusBadge } from '../../components/Badge'
import Button from '../../components/Button'
import BookAppointment from '../components/BookAppointment'
import SelfPrescriptionForm from '../components/SelfPrescriptionForm'
import { useCart } from '../cartContext'
import { getPatientInteractions } from '../../lib/api'
import { formatCheckup } from '../patientData'

export default function Prescriptions() {
  const {
    prescriptions,
    patients,
    doctor,
    togglePrivacy,
    setCheckupDate,
    patientId,
    addSelfPrescription,
    updateSelfPrescription,
  } = useApp()
  const { add: addToCart } = useCart()
  const me = patients.find((p) => p.patient_id === patientId)
  const mine = prescriptions.filter((rx) => rx.patient_id === patientId)
  const [booking, setBooking] = useState(null)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingRx, setEditingRx] = useState(null)
  const [saving, setSaving] = useState(false)
  const [interactions, setInteractions] = useState(null)

  useEffect(() => {
    let cancelled = false
    getPatientInteractions(patientId)
      .then((data) => {
        if (!cancelled) setInteractions(data)
      })
      .catch(() => {
        if (!cancelled) {
          setInteractions({ warnings: [], interaction_note: 'Could not check interactions.' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [patientId])

  function startAdd() {
    setEditingRx(null)
    setFormOpen(true)
  }

  function startEdit(rx) {
    setEditingRx(rx)
    setFormOpen(true)
  }

  async function handleSave(payload) {
    setSaving(true)
    try {
      if (editingRx) {
        await updateSelfPrescription(editingRx.prescription_id, payload)
      } else {
        await addSelfPrescription({ patient_id: patientId, ...payload })
      }
      setFormOpen(false)
      setEditingRx(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function flipPrivacy(rx) {
    try {
      setError('')
      await togglePrivacy(rx.prescription_id, !rx.is_private)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Prescriptions</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Your medicines, follow-ups and where to buy them.
          </p>
        </div>
        {!formOpen && (
          <Button size="sm" onClick={startAdd}>
            <Plus size={15} /> Add medicine
          </Button>
        )}
      </div>

      {interactions && (
        <SectionCard title="Drug interactions">
          {interactions.warnings?.length > 0 ? (
            <ul className="space-y-1.5">
              {interactions.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2 text-sm text-rose-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              {interactions.interaction_note ?? 'No known interactions.'}
            </p>
          )}
        </SectionCard>
      )}

      {formOpen && (
        <SelfPrescriptionForm
          initial={editingRx}
          busy={saving}
          onSave={handleSave}
          onCancel={() => {
            setFormOpen(false)
            setEditingRx(null)
          }}
        />
      )}

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      {mine.length === 0 ? (
        <SectionCard>
          <p className="text-sm text-slate-400">No prescriptions yet.</p>
        </SectionCard>
      ) : (
        mine.map((rx) => (
          <SectionCard
            key={rx.prescription_id}
            title={rx.created}
            action={
              <div className="flex items-center gap-2">
                {rx.created_by === 'patient' && <Badge tone="brand">Self-added</Badge>}
                {rx.is_private && <Badge tone="neutral">Private</Badge>}
                <StatusBadge status={rx.status} />
              </div>
            }
          >
            <ul className="space-y-3">
              {rx.medicines.map((medicine, index) => (
                <li key={index} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {medicine.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {medicine.dosage} · {medicine.timings}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      addToCart({
                        key: `${patientId}:rx:${rx.prescription_id}:${medicine.medicine_id ?? medicine.name}`,
                        member: me?.name ?? 'You',
                        medicine_name: medicine.name,
                        dosage: medicine.dosage,
                        timing_slot: medicine.timings,
                      })
                    }
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                    aria-label={`Add ${medicine.name} to cart`}
                  >
                    <ShoppingCart size={13} /> Add to cart
                  </button>
                </li>
              ))}
            </ul>

            {rx.lab_test && (
              <p className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500">
                <FlaskConical size={14} /> Lab test: {rx.lab_test}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => flipPrivacy(rx)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  rx.is_private
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
                aria-pressed={rx.is_private}
              >
                {rx.is_private ? <Lock size={13} /> : <Unlock size={13} />}
                {rx.is_private ? 'Private from family' : 'Shared with family'}
              </button>

              <div className="flex items-center gap-2">
                {rx.created_by === 'patient' ? (
                  <Button size="sm" variant="ghost" onClick={() => startEdit(rx)}>
                    <Pencil size={14} /> Edit
                  </Button>
                ) : (
                  <>
                    {rx.doctor?.name && (
                      <span className="text-[11px] text-slate-400">{rx.doctor.name}</span>
                    )}
                    {rx.next_checkup_date && (
                      <span className="text-[11px] font-medium text-slate-600">
                        {formatCheckup(rx.next_checkup_date, rx.next_checkup_time)}
                      </span>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setBooking(rx)}>
                      <CalendarDays size={14} /> {rx.next_checkup_date ? 'Change' : 'Book'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </SectionCard>
        ))
      )}

      {booking && (
        <BookAppointment
          doctor={booking.doctor ?? doctor}
          prescriptionId={booking.prescription_id}
          currentIso={booking.next_checkup_date}
          currentTime={booking.next_checkup_time}
          onBooked={async (iso, slot) => {
            await setCheckupDate(booking.prescription_id, iso, slot)
            setBooking(null)
          }}
          onClose={() => setBooking(null)}
        />
      )}
    </div>
  )
}
