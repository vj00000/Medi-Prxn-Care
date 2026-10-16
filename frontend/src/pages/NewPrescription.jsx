import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ImagePlus,
  Loader2,
  Mic,
  Plus,
  Send,
  Square,
  Trash2,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { chatWithDraft, extractPrescription } from '../lib/api'
import Badge from '../components/Badge'
import Button from '../components/Button'
import SectionCard from '../components/SectionCard'

const EMPTY_VITALS = { bp: '', spo2: '', advice: '' }

function getSpeechRecognition() {
  const Impl = window.SpeechRecognition || window.webkitSpeechRecognition
  return Impl ? new Impl() : null
}

export default function NewPrescription() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getPatient, medicines, timingSlots, addPrescription, doctor } = useApp()
  const patient = getPatient(id)

  const [transcript, setTranscript] = useState('')
  const [items, setItems] = useState([])
  const [vitals, setVitals] = useState(EMPTY_VITALS)
  const [draft, setDraft] = useState({
    medicine_id: String(medicines[0]?.id ?? ''),
    dosage: '',
    timings: timingSlots[0],
  })
  // null | 'transcript' | 'chat' — which field the microphone is filling.
  const [listening, setListening] = useState(null)
  const [notice, setNotice] = useState('')
  const [casePaper, setCasePaper] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractNote, setExtractNote] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatting, setChatting] = useState(false)

  const recognitionRef = useRef(null)
  const dictationBaseRef = useRef('')

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

  function stopDictation() {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(null)
  }

  /**
   * Dictate into the chat box or the consultation notes using the browser's
   * own speech API — no backend call, so it costs no Gemini quota.
   */
  function startDictation(target) {
    if (listening) {
      stopDictation()
      return
    }

    const recognition = getSpeechRecognition()
    if (!recognition) {
      setNotice('Voice input needs Chrome, Edge or Safari.')
      return
    }

    setNotice('')
    dictationBaseRef.current =
      target === 'transcript' && transcript ? `${transcript} ` : ''

    recognition.lang = 'en-IN'
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onresult = (event) => {
      let finalText = ''
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += chunk
        else interim += chunk
      }
      const spoken = `${finalText}${interim}`.trim()
      if (target === 'chat') {
        setChatInput(spoken)
      } else {
        setTranscript(`${dictationBaseRef.current}${spoken}`)
      }
    }
    recognition.onerror = (event) => {
      setNotice(
        event.error === 'not-allowed'
          ? 'Microphone permission denied.'
          : `Voice input error: ${event.error}`,
      )
      stopDictation()
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(null)
    }

    recognition.start()
    recognitionRef.current = recognition
    setListening(target)
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

  function draftFromState() {
    return {
      transcript: transcript.trim() || null,
      diagnosis: null,
      lab_test: null,
      medicines: items.map((item) => ({
        medicine_id: item.medicine_id,
        name: item.name,
        dosage: item.dosage,
        timings: item.timings,
      })),
    }
  }

  function applyDraft(next) {
    setTranscript(next.transcript ?? '')
    setItems(
      (next.medicines ?? []).map((medicine) => ({
        medicine_id: medicine.medicine_id ?? null,
        name: medicine.name ?? '',
        dosage: medicine.dosage ?? '—',
        timings: medicine.timings ?? '—',
      })),
    )
  }

  async function handleCasePaper(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-selecting the same file
    if (!file) return

    setCasePaper(file.name)
    setExtractNote('')
    setExtracting(true)

    try {
      const { draft: extracted } = await extractPrescription(file)
      const added = (extracted?.medicines ?? []).map((medicine) => {
        const name = (medicine.name ?? '').trim()
        const known = medicines.find((m) => m.name.toLowerCase() === name.toLowerCase())
        const timings = [medicine.frequency, medicine.timing, medicine.duration]
          .filter(Boolean)
          .join(' · ')
        return {
          medicine_id: known?.id ?? null,
          name: known?.name ?? (name || 'Unrecognised'),
          dosage: medicine.dosage ?? '—',
          timings: timings || '—',
        }
      })

      if (added.length > 0) {
        setItems((prev) => [...prev, ...added])
        setExtractNote(
          `Extracted ${added.length} medicine${added.length > 1 ? 's' : ''} — please review before submitting.`,
        )
      } else {
        setExtractNote('No medicines could be read from that image.')
      }

      // Observations and general advice often sit in the margins of a case
      // paper, not in the medicine list — pull them across too.
      setVitals({
        bp: extracted?.bp ?? '',
        spo2: extracted?.spo2 ?? '',
        advice: extracted?.advice ?? '',
      })

      if (extracted?.diagnosis) {
        setTranscript((prev) => prev || `Diagnosis: ${extracted.diagnosis}`)
      }
    } catch (err) {
      setExtractNote(`Extraction failed: ${err.message}`)
    } finally {
      setExtracting(false)
    }
  }

  async function sendChat(event) {
    event?.preventDefault?.()
    const text = chatInput.trim()
    if (!text || chatting) return

    setChatInput('')
    setChatMessages((prev) => [...prev, { role: 'user', text }])
    setChatting(true)

    try {
      const history = chatMessages.map((message) => ({
        role: message.role,
        text: message.text,
      }))
      const result = await chatWithDraft({ draft: draftFromState(), message: text, history })
      applyDraft(result.draft)
      setChatMessages((prev) => [...prev, { role: 'assistant', text: result.reply }])
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Assistant unavailable: ${err.message}`, error: true },
      ])
    } finally {
      setChatting(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!transcript.trim() && items.length === 0) {
      setError('Add a transcript or at least one medicine before submitting.')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      const observations = [vitals.bp && `BP ${vitals.bp}`, vitals.spo2 && `SpO2 ${vitals.spo2}`]
        .filter(Boolean)
        .join(', ')

      await addPrescription({
        patient_id: patient.patient_id,
        doctor_id: doctor.doctor_id,
        // No DB column for vitals/advice yet, so they ride along in the
        // consultation note until the schema has a home for them.
        transcript: [
          transcript.trim(),
          observations && `Vitals — ${observations}`,
          vitals.advice.trim() && `Advice: ${vitals.advice.trim()}`,
        ]
          .filter(Boolean)
          .join('\n'),
        case_paper_url: null,
        lab_test: null,
        medicines: items.map((item) => ({
          medicine_id: item.medicine_id,
          name: item.name,
          dosage: item.dosage,
          timings: item.timings,
          timing_slot:
            timingSlots.find(
              (slot) => slot.toLowerCase() === (item.timings ?? '').toLowerCase(),
            ) ?? null,
        })),
      })
      navigate('/prescriptions')
    } catch (err) {
      setError(`Could not save the prescription: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
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

      <SectionCard title="Case paper">
        <label
          className={`flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-sm transition-colors ${
            extracting
              ? 'border-brand-300 bg-brand-50/50 text-brand-700'
              : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-brand-300 hover:bg-brand-50/40'
          }`}
        >
          {extracting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <ImagePlus size={18} />
          )}
          <span>
            {extracting
              ? 'Reading the prescription…'
              : 'Upload or capture the case paper (image)'}
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={extracting}
            onChange={handleCasePaper}
          />
        </label>

        {casePaper && !extractNote && (
          <p className="mt-2 text-xs text-slate-500">Attached: {casePaper}</p>
        )}
        {extractNote && (
          <p
            className={`mt-2 text-xs ${
              extractNote.startsWith('Extraction failed')
                ? 'text-rose-600'
                : 'text-slate-600'
            }`}
          >
            {extractNote}
          </p>
        )}
      </SectionCard>

      <SectionCard title="Vitals & advice">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Blood pressure
            </span>
            <input
              className="field"
              placeholder="e.g. 130/85 mmHg"
              value={vitals.bp}
              onChange={(event) =>
                setVitals((current) => ({ ...current, bp: event.target.value }))
              }
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">SpO₂</span>
            <input
              className="field"
              placeholder="e.g. 98%"
              value={vitals.spo2}
              onChange={(event) =>
                setVitals((current) => ({ ...current, spo2: event.target.value }))
              }
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              General advice
            </span>
            <textarea
              rows={3}
              className="field resize-none"
              placeholder="e.g. low salt diet, 30 min walk daily, review in 2 weeks"
              value={vitals.advice}
              onChange={(event) =>
                setVitals((current) => ({ ...current, advice: event.target.value }))
              }
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Read from the case paper on upload — diet, exercise, follow-up or anything else
          written there. Carried into the consultation note; the database has no dedicated
          column for it yet.
        </p>
      </SectionCard>

      <SectionCard title="Ask the assistant">
        {chatMessages.length > 0 && (
          <ul className="mb-3 space-y-2">
            {chatMessages.map((message, index) => (
              <li
                key={index}
                className={`rounded-xl px-3.5 py-2.5 text-sm ${
                  message.role === 'user'
                    ? 'ml-8 bg-brand-50 text-brand-900'
                    : message.error
                      ? 'mr-8 bg-rose-50 text-rose-700'
                      : 'mr-8 bg-slate-100 text-slate-700'
                }`}
              >
                {message.text}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            className="field"
            placeholder='Say or type: "add Amoxicillin 500 mg TDS for 5 days"'
            value={chatInput}
            disabled={chatting}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') sendChat(event)
            }}
          />
          <Button
            type="button"
            variant={listening === 'chat' ? 'danger' : 'ghost'}
            onClick={() => startDictation('chat')}
            title="Dictate your instruction"
          >
            {listening === 'chat' ? <Square size={15} /> : <Mic size={15} />}
          </Button>
          <Button
            type="button"
            loading={chatting}
            disabled={chatting || !chatInput.trim()}
            onClick={sendChat}
          >
            <Send size={15} /> Send
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          The assistant edits the medicine list above — add, change or remove by voice or
          text. Uses the browser&apos;s microphone; the AI key must be configured.
        </p>
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
                key={`${item.medicine_id ?? item.name}-${index}`}
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

      <SectionCard title="Consultation transcript">
        <textarea
          rows={5}
          className="field resize-none"
          placeholder="Type or dictate the consultation notes…"
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={listening === 'transcript' ? 'danger' : 'ghost'}
            size="sm"
            onClick={() => startDictation('transcript')}
          >
            {listening === 'transcript' ? (
              <>
                <Square size={14} /> Stop dictation
              </>
            ) : (
              <>
                <Mic size={15} /> Dictate notes
              </>
            )}
          </Button>
          {listening === 'transcript' && (
            <span className="text-xs font-medium text-rose-600">Listening…</span>
          )}
          {notice && <span className="text-xs text-slate-500">{notice}</span>}
        </div>
      </SectionCard>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" as={Link} to={`/patients/${patient.patient_id}`}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting} disabled={submitting}>
          {submitting ? 'Saving…' : 'Submit for review'}
        </Button>
      </div>
    </form>
  )
}
