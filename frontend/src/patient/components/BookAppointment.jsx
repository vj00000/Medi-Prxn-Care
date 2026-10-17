import { useEffect, useRef, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import Button from '../../components/Button'
import { formatCheckup, todayIso } from '../patientData'

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
 * Reschedule a follow-up with the doctor who issued the prescription.
 *
 * The Calendly embed is offered when that doctor has their own link, but it is
 * never the only way out: Calendly reports a completed booking on the window
 * `message` bus, and that event does not always carry a parseable start time.
 * The date and time fields below are the guaranteed path.
 */
export default function BookAppointment({
  doctor,
  currentIso,
  currentTime,
  onBooked,
  onClose,
}) {
  const container = useRef(null)
  const [status, setStatus] = useState(doctor?.calendly_url ? 'loading' : 'none')
  const [date, setDate] = useState(currentIso ?? '')
  const [time, setTime] = useState(currentTime ? String(currentTime).slice(0, 5) : '')
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
      // No start_time => leave the fields to the patient rather than no-op.
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

  async function save(event) {
    event.preventDefault()
    if (!date) {
      setError('Pick a date first.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await onBooked(date, time || null)
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
              <strong>{formatCheckup(currentIso, currentTime)}</strong>.
            </p>
          )}

          {doctor?.calendly_url && status !== 'failed' && (
            <>
              <p className="mb-2 text-xs font-medium text-slate-600">
                Pick a slot on {doctor.name}'s calendar
              </p>
              <div
                ref={container}
                className="min-h-[520px] overflow-hidden rounded-xl border border-slate-200"
              />
              <p className="mt-3 text-center text-[11px] font-medium uppercase tracking-wider text-slate-400">
                or set the slot directly
              </p>
            </>
          )}

          {status === 'failed' && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {doctor?.name}'s Calendly could not be loaded. Use the fields below.
            </p>
          )}

          {status === 'none' && (
            <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {doctor?.name ?? 'This doctor'} has not connected a booking calendar yet. Pick a
              slot below and the clinic will confirm.
            </p>
          )}

          <div className="mt-1 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Date</span>
              <input
                type="date"
                className="field"
                value={date}
                min={todayIso()}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                Time <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input
                type="time"
                className="field"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </label>
          </div>

          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

          <Button type="submit" loading={saving} className="mt-4 w-full">
            <CalendarDays size={15} /> {currentIso ? 'Save new slot' : 'Confirm slot'}
          </Button>
        </div>
      </form>
    </div>
  )
}
