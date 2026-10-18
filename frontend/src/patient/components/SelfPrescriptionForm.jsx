import { useRef, useState } from 'react'
import { FileUp, Mic, MicOff, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import Button from '../../components/Button'
import { extractPrescription, parseNote } from '../../lib/api'
import { useDictation } from '../../lib/useDictation'

const EMPTY_LINE = {
  name: '',
  dosage: '',
  timings: '',
  timing_slot: '',
  duration_days: '',
}

/** "30 days" / "thirty days" -> 30, else ''. */
function daysFrom(duration) {
  if (!duration) return ''
  const match = String(duration).match(/(\d+)/)
  return match ? Number(match[1]) : ''
}

/** Map extracted/dictated medicines onto the form's line shape. */
function toLines(medicines) {
  return (medicines ?? []).map((medicine) => {
    const name = (medicine.name ?? '').trim()
    const timings = [medicine.frequency, medicine.timing].filter(Boolean).join(' · ')
    return {
      name: name || 'Unrecognised',
      dosage: medicine.dosage ?? '',
      timings,
      timing_slot: '',
      duration_days: daysFrom(medicine.duration),
    }
  })
}

/**
 * Add or edit a prescription the patient is recording for themselves.
 * Supports typing, case-paper upload, and voice dictation.
 */
export default function SelfPrescriptionForm({ initial = null, onSave, onCancel, busy }) {
  const { timingSlots } = useApp()
  const fileRef = useRef(null)
  const [diagnosis, setDiagnosis] = useState(initial?.diagnosis ?? '')
  const [lines, setLines] = useState(() => {
    if (initial?.medicines?.length) {
      return initial.medicines.map((medicine) => ({
        name: medicine.name ?? '',
        dosage: medicine.dosage ?? '',
        timings: medicine.timings ?? '',
        timing_slot: '',
        duration_days: medicine.duration_days ?? '',
      }))
    }
    return [{ ...EMPTY_LINE }]
  })
  const [busyExtract, setBusyExtract] = useState(false)
  const [busyParse, setBusyParse] = useState(false)
  const [note, setNote] = useState('')

  function setLine(index, field, value) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    )
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }])
  }

  function removeLine(index) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  /** Append extracted medicines to any already-typed lines. */
  function applyExtracted(draft) {
    const extracted = toLines(draft?.medicines ?? [])
    if (extracted.length > 0) {
      setLines((prev) => [...prev.filter((line) => line.name.trim()), ...extracted])
    }
    if (draft?.diagnosis) {
      setDiagnosis((current) => current || draft.diagnosis)
    }
  }

  async function handleCasePaper(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusyExtract(true)
    setNote('')
    try {
      const { draft } = await extractPrescription(file)
      applyExtracted(draft)
      const count = (draft?.medicines ?? []).length
      setNote(
        count > 0
          ? `Read ${count} medicine${count > 1 ? 's' : ''} from the case paper — review before saving.`
          : 'No medicines could be read from that image.',
      )
    } catch (err) {
      setNote(`Could not read the case paper: ${err.message}`)
    } finally {
      setBusyExtract(false)
    }
  }

  const { start, stop, listening, notice: micNotice } = useDictation(async (spoken) => {
    setBusyParse(true)
    setNote('Reading your words…')
    try {
      const result = await parseNote(spoken)
      applyExtracted(result)
      const count = (result?.medicines ?? []).length
      setNote(
        count > 0
          ? `Heard ${count} medicine${count > 1 ? 's' : ''} — review before saving.`
          : `Heard "${spoken}", but no medicines were recognised.`,
      )
    } catch (err) {
      setNote(`Could not read that: ${err.message}`)
    } finally {
      setBusyParse(false)
    }
  })

  function submit(event) {
    event.preventDefault()
    const medicines = lines
      .map((line) => ({
        name: line.name.trim(),
        dosage: line.dosage.trim() || null,
        timings: line.timings.trim() || null,
        timing_slot: line.timing_slot || null,
        duration_days: line.duration_days ? Number(line.duration_days) : null,
      }))
      .filter((medicine) => medicine.name)
    onSave({ diagnosis: diagnosis.trim() || null, medicines })
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-brand-200 bg-brand-50/60 p-4"
    >
      <p className="text-sm font-semibold text-slate-800">
        {initial ? 'Edit your medicine' : 'Add your medicine'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={busyExtract}
          disabled={busyExtract || busyParse}
          onClick={() => fileRef.current?.click()}
        >
          <FileUp size={15} /> Upload case paper
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCasePaper}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busyExtract || busyParse}
          onClick={listening ? stop : start}
        >
          {listening ? <MicOff size={15} /> : <Mic size={15} />}
          {listening ? 'Stop' : 'Speak your medicine'}
        </Button>
      </div>

      {(note || micNotice) && (
        <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-500">
          {note || micNotice}
        </p>
      )}

      {lines.map((line, index) => (
        <div key={index} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Medicine {index + 1}</span>
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => removeLine(index)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600"
                aria-label="Remove medicine"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <input
            className="field"
            placeholder="Medicine name"
            value={line.name}
            onChange={(e) => setLine(index, 'name', e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="field"
              placeholder="Dosage (e.g. 500 mg)"
              value={line.dosage}
              onChange={(e) => setLine(index, 'dosage', e.target.value)}
            />
            <input
              className="field"
              type="number"
              min="0"
              placeholder="Days"
              value={line.duration_days}
              onChange={(e) => setLine(index, 'duration_days', e.target.value)}
            />
          </div>
          <input
            className="field"
            placeholder="How often (e.g. twice daily after meals)"
            value={line.timings}
            onChange={(e) => setLine(index, 'timings', e.target.value)}
          />
          <select
            className="field"
            value={line.timing_slot}
            onChange={(e) => setLine(index, 'timing_slot', e.target.value)}
          >
            <option value="">Reminder time (optional)</option>
            {timingSlots.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </div>
      ))}

      <button
        type="button"
        onClick={addLine}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
      >
        <Plus size={15} /> Add another medicine
      </button>

      <input
        className="field"
        placeholder="Note / reason (optional)"
        value={diagnosis}
        onChange={(e) => setDiagnosis(e.target.value)}
      />

      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={busy}>
          {initial ? 'Save changes' : 'Save medicine'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
