import { useEffect, useState } from 'react'
import { CalendarDays, Loader2, X } from 'lucide-react'
import Button from '../../components/Button'
import { getAvailability } from '../../lib/api'
import { formatLongDate, formatTime, todayIso } from '../patientData'

/**
 * Reschedule against the doctor who issued the prescription.
 *
 * The patient never types a time — they pick from the slots that doctor can
 * actually take, served by GET /doctors/{id}/availability. The backend rejects
 * anything else, so a stale tab cannot book a taken or closed slot.
 */
export default function BookAppointment({
  doctor,
  prescriptionId,
  currentIso,
  currentTime,
  onBooked,
  onClose,
}) {
  const [date, setDate] = useState(currentIso ?? '')
  const [time, setTime] = useState(currentTime ? String(currentTime).slice(0, 5) : '')
  const [slots, setSlots] = useState([])
  const [slotState, setSlotState] = useState('idle')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!date || !doctor?.doctor_id) {
      setSlots([])
      setSlotState('idle')
      return undefined
    }

    let cancelled = false
    setSlotState('loading')

    getAvailability(doctor.doctor_id, date, prescriptionId)
      .then((data) => {
        if (cancelled) return
        setSlots((data.slots ?? []).map((slot) => String(slot).slice(0, 5)))
        setSlotState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setSlots([])
        setSlotState('error')
        setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [doctor, date, prescriptionId])

  async function save(event) {
    event.preventDefault()
    if (!date) {
      setError('Pick a date first.')
      return
    }
    if (!time) {
      setError('Pick one of the available slots.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await onBooked(date, time)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 sm:items-center">
      <form onSubmit={save} className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {currentIso ? 'Reschedule follow-up' : 'Book a follow-up'}
            </p>
            <p className="text-xs text-slate-500">
              {doctor?.name ?? 'Your doctor'}
              {doctor?.specialization ? ` · ${doctor.specialization}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          {currentIso && (
            <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Currently scheduled for{' '}
              <strong>
                {formatLongDate(currentIso)}
                {currentTime ? `, ${formatTime(currentTime)}` : ' (time not set)'}
              </strong>
              .
            </p>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Date</span>
            <input
              type="date"
              className="field"
              value={date}
              min={todayIso()}
              onChange={(event) => {
                setDate(event.target.value)
                setTime('')
                setError('')
              }}
            />
          </label>

          {date && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-slate-600">
                Available slots
                {doctor?.slot_minutes ? (
                  <span className="ml-1 font-normal text-slate-400">
                    ({doctor.slot_minutes} min each)
                  </span>
                ) : null}
              </p>

              {slotState === 'loading' && (
                <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <Loader2 size={13} className="animate-spin" /> Checking the schedule…
                </p>
              )}

              {slotState === 'error' && (
                <p className="text-xs text-rose-600">Could not load availability.</p>
              )}

              {slotState === 'ready' && slots.length === 0 && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  No free slots on {formatLongDate(date)}. Try another day.
                </p>
              )}

              {slotState === 'ready' && slots.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {slots.map((slot) => {
                    const active = slot === time
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => {
                          setTime(slot)
                          setError('')
                        }}
                        className={`rounded-lg border px-1 py-1.5 text-[11px] font-medium transition-colors ${
                          active
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50'
                        }`}
                      >
                        {formatTime(slot)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

          <Button
            type="submit"
            loading={saving}
            disabled={!date || !time}
            className="mt-4 w-full"
          >
            <CalendarDays size={15} /> {currentIso ? 'Save new slot' : 'Confirm slot'}
          </Button>
        </div>
      </form>
    </div>
  )
}
