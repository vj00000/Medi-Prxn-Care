import { useState } from 'react'
import { CalendarDays, ExternalLink, FlaskConical, Lock, Unlock } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import SectionCard from '../../components/SectionCard'
import Badge, { StatusBadge } from '../../components/Badge'
import Button from '../../components/Button'
import BookAppointment from '../components/BookAppointment'
import { CURRENT_PATIENT_ID, formatCheckup, oneMgUrl } from '../patientData'

export default function Prescriptions() {
  const { prescriptions, doctor, togglePrivacy, setCheckupDate } = useApp()
  const mine = prescriptions.filter((rx) => rx.patient_id === CURRENT_PATIENT_ID)
  const [booking, setBooking] = useState(null)
  const [error, setError] = useState('')

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
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Prescriptions</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Your medicines, follow-ups and where to buy them.
        </p>
      </div>

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
                  <a
                    href={oneMgUrl(medicine.name)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                  >
                    <ExternalLink size={13} /> Buy
                  </a>
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
