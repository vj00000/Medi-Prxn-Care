import { useEffect } from 'react'
import { AlarmClock, Check, Clock } from 'lucide-react'
import { useDoses } from '../doseContext'
import { slotHour } from '../patientData'
import Button from '../../components/Button'

const BEEP_INTERVAL_MS = 1500

let audioCtx = null

/**
 * Browsers refuse to start audio until the document has received a user
 * gesture, and they do it silently — no error, no console warning, just no
 * sound. So the context is created inside a real click.
 *
 * This module is imported by PatientLayout, which App.jsx imports eagerly, so
 * the listeners are registered at bundle load — before the user can click
 * anything. The click that navigates into the portal therefore unlocks the
 * alarm, and no "enable sound" step is needed.
 */
function unlockAudio() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    audioCtx = new AudioCtx()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', unlockAudio, { once: true })
  document.addEventListener('touchstart', unlockAudio, { once: true })
}

/**
 * One short alarm chirp. The gain is ramped rather than switched on — a hard
 * start on a sine at full volume produces an audible click.
 */
function chirp() {
  if (!audioCtx || audioCtx.state !== 'running') return

  const now = audioCtx.currentTime
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  osc.type = 'sine'
  osc.frequency.value = 880
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)

  osc.connect(gain).connect(audioCtx.destination)
  osc.start(now)
  osc.stop(now + 0.55)
}

export default function DoseAlarm() {
  const { ringing, markTaken, snooze, dismissAlarm } = useDoses()

  useEffect(() => {
    if (!ringing) return undefined
    chirp() // sound immediately, then repeat until dismissed
    const id = setInterval(chirp, BEEP_INTERVAL_MS)
    return () => clearInterval(id)
  }, [ringing])

  if (!ringing) return null

  const hasTime = slotHour(ringing.timing_slot) !== undefined

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <AlarmClock size={26} className="animate-pulse" />
        </span>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-brand-700">
          Time for your medicine
        </p>
        <p className="mt-1 text-lg font-bold text-slate-900">{ringing.medicine_name}</p>
        <p className="text-sm text-slate-500">
          {ringing.dosage}
          {hasTime ? ` · ${ringing.timing_slot}` : ''}
        </p>

        <div className="mt-6 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={snooze}>
            <Clock size={15} /> Snooze 10m
          </Button>
          <Button className="flex-1" onClick={() => markTaken(ringing.id)}>
            <Check size={15} /> Taken
          </Button>
        </div>

        <button
          type="button"
          onClick={dismissAlarm}
          className="mt-4 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
        >
          Dismiss without logging
        </button>
      </div>
    </div>
  )
}
