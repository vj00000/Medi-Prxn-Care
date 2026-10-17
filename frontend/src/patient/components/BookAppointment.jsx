import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Loader2, X } from 'lucide-react'
import Button from '../../components/Button'
import { getAvailability } from '../../lib/api'
import { formatLongDate, formatTime, todayIso } from '../patientData'

const SCRIPT_SRC = 'https://assets.calendly.com/assets/external/widget.js'

/** Calendly's embed script is loaded once and reused across openings. */
function loadCalendly() {
  if (window.Calendly) return Promise.resolve()
  const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`)
  if (existing) {
    return new Promise((resolve) => existing.addEventListener('load', resolve))
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.onload = resolve
    script.onerror = reject
    document.body.appendChild(script)
  })
}

/**
 * Calendly reports the slot in UTC; the patient reads local wall-clock time,
 * which is also what the clinic means by "10:30".
 */
function localSlot(start) {
  const parsed = new Date(start)
  if (Number.isNaN(parsed.getTime())) return null
  const pad = (value) => String(value).padStart(2, '0')
  return {
    date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
  }
}

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
  const container = useRef(null)
  const [status, setStatus] = useState(doctor?.calendly_url ? 'loading' : 'none')
  const [date, setDate] = useState(currentIso ?? '')
  const [time, setTime] = useState(currentTime ? String(currentTime).slice(0, 5) : '')
  const [slots, setSlots] = useState([])
  const [slotState, setSlotState] = useState('idle')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!doctor?.calendly_url) {
      setStatus('none')
      return undefined
    }

    let cancelled = false

    function onMessage(event) {
      const payload = event.data
      if (!payload || payload.event !== 'calendly.event_scheduled') return
      const slot = localSlot(payload.payload?.event?.start_time)
      if (!slot) return
      setDate(slot.date)
      setTime(slot.time)
    }

    window.addEventListener('message', onMessage)

    loadCalendly()
      .then(() => {
        if (cancelled || !container.current) return
        window.Calendly.initInlineWidget({
          url: doctor.calendly_url,
          parentElement: container.current,
        })
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('failed')
      })

    return () => {
      cancelled = true
      window.removeEventListener('message', onMessage)
    }
  }, [doctor])

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
      .catch(() => {
        if (cancelled) return
        setSlots([])
        setSlotState('error')
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

          {doctor?.calendly_url && status !== 'failed' && (
            <>
              <p className="mb-2 text-xs font-medium text-slate-600">
                Book on {doctor.name}'s Calendly
              </p>
              <div
                ref={container}
                className="min-h-[480px] overflow-hidden rounded-xl border border-slate-200"
              />
              <p className="mt-3 text-center text-[11px] font-medium uppercase tracking-wider text-slate-400">
                or pick from their open slots
              </p>
            </>
          )}

          {status === 'failed' && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {doctor?.name}'s Calendly could not be loaded. Pick a slot below.
            </p>
          )}

          {status === 'none' && doctor && (
            <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {doctor.name} has not connected a booking calendar. Pick a slot below.
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
                  <Loader2 size={13} className="animate-spin" /> Checking the calendar…
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
