import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrCode } from 'lucide-react'
import { useApp } from '../store/AppStore'
import Button from '../components/Button'

const SAMPLE_TOKEN = 'QR-VIKRAM-0001'

export default function Scan() {
  const { patients } = useApp()
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')

  function lookup(value) {
    const found = patients.find(
      (p) => p.qr_token.toLowerCase() === String(value).trim().toLowerCase(),
    )
    if (found) {
      navigate(`/patients/${found.patient_id}`)
    } else {
      setError('No patient matches that QR token.')
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="card p-6">
        <div className="relative mx-auto flex h-56 w-56 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
          <div className="absolute inset-x-8 top-1/2 h-0.5 animate-pulse bg-brand-500/70" />
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <QrCode size={40} />
            <span className="text-xs font-medium">Camera preview</span>
          </div>
        </div>
        <p className="mt-5 text-center text-sm text-slate-500">
          Point the camera at the patient's QR code, or enter the token manually below.
        </p>
        <p className="mt-1 text-center text-xs text-slate-400">
          Live camera capture is not enabled in this build.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          lookup(token)
        }}
        className="card space-y-4 p-6"
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">QR token</label>
          <input
            className="field"
            placeholder="e.g. QR-VIKRAM-0001"
            value={token}
            onChange={(event) => {
              setToken(event.target.value)
              setError('')
            }}
          />
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            Look up patient
          </Button>
          <Button type="button" variant="ghost" onClick={() => lookup(SAMPLE_TOKEN)}>
            Use sample
          </Button>
        </div>
      </form>
    </div>
  )
}
