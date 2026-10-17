import { useEffect, useRef, useState } from 'react'
import { CalendarPlus, X } from 'lucide-react'
import Button from '../../components/Button'

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

function isoInDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * The doctor's Calendly widget, inline.
 *
 * Calendly reports a completed booking on the window `message` bus, which is
 * how we learn the slot without a webhook. If the embed cannot load (no link,
 * offline, blocked), a quick action still sets a date so the flow is testable.
 */
export default function BookAppointment({ doctor, currentDate, onBooked, onClose }) {
  const container = useRef(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false

    function onMessage(event) {
      const payload = event.data
      if (!payload || payload.event !== 'calendly.event_scheduled') return
      const start = payload.payload?.event?.start_time
      if (start) onBooked(String(start).slice(0, 10))
    }

    window.addEventListener('message', onMessage)

    if (!doctor?.calendly_url) {
      setStatus('failed')
    } else {
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
    }

    return () => {
      cancelled = true
      window.removeEventListener('message', onMessage)
    }
  }, [doctor, onBooked])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Book a follow-up</p>
            <p className="text-xs text-slate-500">{doctor?.name ?? 'Your doctor'}</p>
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
          {currentDate && (
            <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Currently scheduled for <strong>{currentDate}</strong>.
            </p>
          )}

          {status === 'failed' ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The Calendly widget could not be loaded. Use the quick action below.
            </p>
          ) : (
            <div ref={container} className="min-h-[560px]" />
          )}

          <div className="mt-4 border-t border-slate-100 pt-4">
            <Button variant="ghost" className="w-full" onClick={() => onBooked(isoInDays(14))}>
              <CalendarPlus size={15} /> Simulate a booking (14 days out)
            </Button>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              For trying the flow without a live Calendly account.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
