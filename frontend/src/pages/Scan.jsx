import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrCode } from 'lucide-react'
import jsQR from 'jsqr'
import { useApp } from '../store/AppStore'
import Button from '../components/Button'

export default function Scan() {
  const { patients } = useApp()
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [cameraError, setCameraError] = useState('')

  const videoBoxRef = useRef(null)
  const handledRef = useRef(false)
  const patientsRef = useRef(patients)
  patientsRef.current = patients
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  function lookup(value) {
    const trimmed = String(value).trim().toLowerCase()
    const found = patientsRef.current.find(
      (p) => p.qr_token.toLowerCase() === trimmed,
    )
    if (found) {
      navigateRef.current(`/patients/${found.patient_id}`)
      return true
    }
    return false
  }

  function resolveScan(text) {
    const trimmed = String(text).trim()

    // New QRs carry a tiny JSON payload with the patient's ids.
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed?.patient_id != null) {
        navigateRef.current(`/patients/${parsed.patient_id}`)
        return true
      }
    } catch {
      // Not JSON — fall through to the legacy token lookup.
    }

    return lookup(trimmed)
  }

  useEffect(() => {
    let cancelled = false
    let stream = null
    let frame = null

    const video = document.createElement('video')
    video.setAttribute('playsinline', 'true')
    video.setAttribute('muted', 'true')
    video.className = 'h-full w-full object-cover'
    videoBoxRef.current?.appendChild(video)

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        video.srcObject = stream
        await video.play()

        const tick = () => {
          if (cancelled || handledRef.current) return

          if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
            // Downscale so the frame decode stays fast on phone CPUs.
            const scale = Math.min(1, 640 / video.videoWidth)
            canvas.width = Math.max(1, Math.floor(video.videoWidth * scale))
            canvas.height = Math.max(1, Math.floor(video.videoHeight * scale))
            context.drawImage(video, 0, 0, canvas.width, canvas.height)

            const image = context.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(image.data, image.width, image.height, {
              inversionAttempts: 'dontInvert',
            })

            if (code?.data) {
              handledRef.current = true
              if (!resolveScan(code.data)) {
                handledRef.current = false
                setError('Could not read a patient from that QR code.')
                frame = requestAnimationFrame(tick)
              }
              return
            }
          }

          frame = requestAnimationFrame(tick)
        }

        tick()
      } catch (err) {
        if (!cancelled) {
          setCameraError(err?.message ?? 'Camera unavailable.')
        }
      }
    }

    start()

    return () => {
      cancelled = true
      if (frame) cancelAnimationFrame(frame)
      if (stream) stream.getTracks().forEach((track) => track.stop())
      if (video.srcObject) video.srcObject = null
      video.remove()
    }
  }, [])

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="card p-6">
        <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl border-2 border-slate-200 bg-slate-950">
          <div ref={videoBoxRef} className="absolute inset-0" />

          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 text-slate-400">
              <QrCode size={40} />
              <span className="px-4 text-center text-xs font-medium">{cameraError}</span>
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="absolute inset-6 rounded-xl border-2 border-brand-400/80" />
            </div>
          )}
        </div>

        {cameraError ? (
          <p className="mt-4 text-center text-xs text-slate-500">
            Enter the token manually below instead.
          </p>
        ) : (
          <p className="mt-4 text-center text-sm text-slate-500">
            Point the camera at the patient's QR code.
          </p>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (lookup(token)) return
          setError('No patient matches that QR token.')
        }}
        className="card space-y-4 p-6"
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            QR token
          </label>
          <input
            className="field"
            placeholder="e.g. QR-A1B2C-0001"
            value={token}
            onChange={(event) => {
              setToken(event.target.value)
              setError('')
            }}
          />
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <Button type="submit" className="w-full">
          Look up patient
        </Button>
      </form>
    </div>
  )
}
