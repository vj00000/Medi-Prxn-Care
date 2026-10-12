import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ImagePlus, Mic, Plus, Square, Trash2 } from 'lucide-react'
import { useApp } from '../store/AppStore'
import Badge from '../components/Badge'
import Button from '../components/Button'
import SectionCard from '../components/SectionCard'

export default function NewPrescription() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getPatient, medicines, timingSlots, addPrescription } = useApp()
  const patient = getPatient(id)

  const [transcript, setTranscript] = useState('')
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState({
    medicine_id: String(medicines[0]?.id ?? ''),
    dosage: '',
    timings: timingSlots[0],
  })
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState('')
  const [casePaper, setCasePaper] = useState('')
  const [error, setError] = useState('')
  const recorderRef = useRef(null)

  if (!patient) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-slate-500">Patient not found.</p>
        <Link
          to="/patients"
          className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline"
        >
          Back to patients
        </Link>
      </div>
    )
  }

  function addItem() {
    const medicine = medicines.find((m) => m.id === Number(draft.medicine_id))
    if (!medicine) return
    setItems((prev) => [
      ...prev,
      {
        medicine_id: medicine.id,
        name: medicine.name,
        dosage: draft.dosage.trim() || '—',
        timings: draft.timings,
      },
    ])
    setDraft((current) => ({ ...current, dosage: '' }))
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop()
      return
    }
    setNotice('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        setRecording(false)
        setTranscript(
          (prev) =>
            `${prev ? `${prev}\n` : ''}[Voice note captured — transcription available via the AI pipeline]`,
        )
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      setNotice('Microphone unavailable — please type the transcript instead.')
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!transcript.trim() && items.length === 0) {
      setError('Add a transcript or at least one medicine before submitting.')
      return
    }
    addPrescription({
      patient_id: patient.patient_id,
      status: 'review',
      created: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      lab_test: null,
      transcript: transcript.trim(),
      medicines: items.map((item) => ({ ...item, is_active: true })),
    })
    navigate('/prescriptions')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Link
        to={`/patients/${patient.patient_id}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} /> Back to {patient.name}
      </Link>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Prescribing for
          </p>
          <p className="text-base font-semibold text-slate-900">{patient.name}</p>
          <p className="text-xs text-slate-500">
            {patient.age} yrs · {patient.gender}
          </p>
        </div>
        {patient.allergies.length > 0 ? (
          <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
            <AlertTriangle size={16} />
            Allergy: {patient.allergies.join(', ')}
          </div>
        ) : (
          <Badge tone="approved">No known allergies</Badge>
        )}
      </div>

      <SectionCard title="Consultation transcript">
        <textarea
          rows={5}
          className="field resize-none"
          placeholder="Type or record the consultation notes…"
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={recording ? 'danger' : 'ghost'}
            size="sm"
            onClick={toggleRecording}
          >
            {recording ? (
              <>
                <Square size={14} /> Stop recording
              </>
            ) : (
              <>
                <Mic size={15} /> Record voice
              </>
            )}
          </Button>
          {recording && <span className="text-xs font-medium text-rose-600">Recording…</span>}
          {notice && <span className="text-xs text-slate-500">{notice}</span>}
        </div>
      </SectionCard>

      <SectionCard title="Medicines">
        <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_1.5fr_auto]">
          <select
            className="field"
            value={draft.medicine_id}
            onChange={(event) =>
              setDraft((current) => ({ ...current, medicine_id: event.target.value }))
            }
          >
            {medicines.map((medicine) => (
              <option key={medicine.id} value={medicine.id}>
                {medicine.name} · {medicine.brand}
              </option>
            ))}
          </select>
          <input
            className="field"
            placeholder="Dosage"
            value={draft.dosage}
            onChange={(event) =>
              setDraft((current) => ({ ...current, dosage: event.target.value }))
            }
          />
          <select
            className="field"
            value={draft.timings}
            onChange={(event) =>
              setDraft((current) => ({ ...current, timings: event.target.value }))
            }
          >
            {timingSlots.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
          <Button type="button" variant="subtle" onClick={addItem}>
            <Plus size={16} /> Add
          </Button>
        </div>

        {items.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100">
            {items.map((item, index) => (
              <li
                key={`${item.medicine_id}-${index}`}
                className="flex items-center justify-between py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {item.dosage} · {item.timings}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Remove ${item.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Case paper">
        <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 transition-colors hover:border-brand-300 hover:bg-brand-50/40">
          <ImagePlus size={18} />
          <span>Upload or capture the case paper (image)</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => setCasePaper(event.target.files?.[0]?.name ?? '')}
          />
        </label>
        {casePaper && <p className="mt-2 text-xs text-slate-500">Attached: {casePaper}</p>}
      </SectionCard>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" as={Link} to={`/patients/${patient.patient_id}`}>
          Cancel
        </Button>
        <Button type="submit">Submit for review</Button>
      </div>
    </form>
  )
}
