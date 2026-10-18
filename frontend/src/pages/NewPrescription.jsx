import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ImagePlus,
  Loader2,
  Mic,
  Plus,
  Square,
  Trash2,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { checkInteractions, extractPrescription, getAvailability } from '../lib/api'
import { useDictation } from '../lib/useDictation'
import { formatLongDate, formatTime, todayIso } from '../patient/patientData'
import Badge from '../components/Badge'
import Button from '../components/Button'
import SectionCard from '../components/SectionCard'

const EMPTY_VITALS = { bp: '', spo2: '', advice: '' }

/** "5 days" / "3 days" -> 5 / 3; anything else -> null. */
function daysFrom(text) {
  const match = (text ?? '').match(/(\d+)\s*day/i)
  return match ? Number(match[1]) : null
}

/** A table cell that is plain text until clicked, then becomes an input. */
function EditableCell({ value, onChange, type = 'text', className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const cancelRef = useRef(false)

  function start() {
    cancelRef.current = false
    setDraft(value == null ? '' : String(value))
    setEditing(true)
  }

  function finish() {
    setEditing(false)
    if (!cancelRef.current) onChange(draft)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        className="field w-full min-w-[90px] px-2 py-1"
        value={draft}
        placeholder="—"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            cancelRef.current = true
            event.currentTarget.blur()
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      title="Click to edit"
      className={`w-full rounded px-1 py-0.5 text-left transition-colors hover:bg-slate-100 focus:outline-none ${className}`}
    >
      {value === undefined || value === null || value === '' ? '—' : value}
    </button>
  )
}

export default function NewPrescription() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    getPatient,
    medicines,
    timingSlots,
    addPrescription,
    doctor,
    loading,
    draft: rxDraft,
    setDraft: setRxDraft,
    resetDraft,
  } = useApp()
  const patient = getPatient(id)

  const [newMedicineName, setNewMedicineName] = useState('')
  const [followUp, setFollowUp] = useState({ date: '', time: '' })
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsState, setSlotsState] = useState('idle')
  const [vitals, setVitals] = useState(EMPTY_VITALS)
  const [draft, setDraft] = useState({
    medicine_id: String(medicines[0]?.id ?? ''),
    dosage: '',
    timings: timingSlots[0],
    days: '',
  })
  const [casePaper, setCasePaper] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractNote, setExtractNote] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [interactionResult, setInteractionResult] = useState(null)
  const [checking, setChecking] = useState(false)

  const {
    start: startDiagnosisDictation,
    stop: stopDiagnosisDictation,
    listening: dictating,
    notice: dictationNotice,
  } = useDictation((spoken) => {
    setRxDraft((d) => ({
      ...d,
      diagnosis: d.diagnosis ? `${d.diagnosis} ${spoken}` : spoken,
    }))
  })

  // `medicines` is fetched from the API after the first render, so the select
  // starts empty and has to be seeded once the catalog arrives.
  useEffect(() => {
    if (!draft.medicine_id && medicines.length > 0) {
      setDraft((current) => ({ ...current, medicine_id: String(medicines[0].id) }))
    }
  }, [medicines, draft.medicine_id])

  // The floating assistant edits the same draft — start clean for each patient
  // and when leaving the form.
  useEffect(() => {
    resetDraft()
    return () => resetDraft()
  }, [id, resetDraft])

  // Follow-up slots come from the doctor's real availability in the DB.
  useEffect(() => {
    if (!followUp.date || !doctor?.doctor_id) {
      setAvailableSlots([])
      setSlotsState('idle')
      return undefined
    }

    let cancelled = false
    setSlotsState('loading')

    getAvailability(doctor.doctor_id, followUp.date)
      .then((data) => {
        if (cancelled) return
        setAvailableSlots((data.slots ?? []).map((slot) => String(slot).slice(0, 5)))
        setSlotsState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setAvailableSlots([])
        setSlotsState('error')
      })

    return () => {
      cancelled = true
    }
  }, [doctor, followUp.date])

  if (loading) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-slate-500">Loading patient…</p>
      </div>
    )
  }

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
    const isNew = draft.medicine_id === 'new'
    const newName = isNew ? newMedicineName.trim() : null
    const medicine = isNew
      ? null
      : medicines.find((m) => m.id === Number(draft.medicine_id))
    if (isNew ? !newName : !medicine) return

    setRxDraft((current) => ({
      ...current,
      medicines: [
        ...current.medicines,
        {
          medicine_id: medicine?.id ?? null,
          name: medicine?.name ?? newName,
          dosage: draft.dosage.trim() || '—',
          timings: draft.timings,
          duration_days: draft.days ? Number(draft.days) : null,
        },
      ],
    }))
    setNewMedicineName('')
    setDraft((current) => ({
      ...current,
      dosage: '',
      days: '',
      medicine_id: String(medicines[0]?.id ?? ''),
    }))
  }

  function updateItem(index, patch) {
    setRxDraft((current) => ({
      ...current,
      medicines: current.medicines.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    }))
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
        const timings = [medicine.frequency, medicine.timing].filter(Boolean).join(' · ')
        return {
          medicine_id: known?.id ?? null,
          name: known?.name ?? (name || 'Unrecognised'),
          dosage: medicine.dosage ?? '—',
          timings: timings || '—',
          duration_days: daysFrom(medicine.duration),
        }
      })

      if (added.length > 0) {
        setRxDraft((current) => ({
          ...current,
          medicines: [...current.medicines, ...added],
        }))
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

      const extractedDetails = [
        extracted?.symptoms && `Symptoms: ${extracted.symptoms.trim()}`,
        extracted?.diagnosis && `Diagnosis: ${extracted.diagnosis.trim()}`,
      ]
        .filter(Boolean)
        .join('\n')

      if (extractedDetails) {
        setRxDraft((current) => ({
          ...current,
          diagnosis: current.diagnosis || extractedDetails,
        }))
      }
    } catch (err) {
      setExtractNote(`Extraction failed: ${err.message}`)
    } finally {
      setExtracting(false)
    }
  }

  function buildPayload(approve) {
    const observations = [vitals.bp && `BP ${vitals.bp}`, vitals.spo2 && `SpO2 ${vitals.spo2}`]
      .filter(Boolean)
      .join(', ')

    return {
      patient_id: patient.patient_id,
      doctor_id: doctor.doctor_id,
      diagnosis: rxDraft.diagnosis.trim() || null,
      // No DB column for vitals/advice yet, so they ride along in the
      // consultation note until the schema has a home for them.
      transcript: [
        observations && `Vitals — ${observations}`,
        vitals.advice.trim() && `Advice: ${vitals.advice.trim()}`,
      ]
        .filter(Boolean)
        .join('\n') || null,
      case_paper_url: null,
      lab_test: null,
      approve,
      next_checkup_date: followUp.date || null,
      next_checkup_time: followUp.time || null,
      medicines: rxDraft.medicines.map((item) => ({
        medicine_id: item.medicine_id,
        name: item.name,
        dosage: item.dosage,
        timings: item.timings,
        duration_days: item.duration_days ?? null,
        timing_slot:
          timingSlots.find(
            (slot) => slot.toLowerCase() === (item.timings ?? '').toLowerCase(),
          ) ?? null,
      })),
    }
  }

  async function submit(approve) {
    if (!rxDraft.diagnosis.trim() && rxDraft.medicines.length === 0) {
      setError('Add a diagnosis or at least one medicine before submitting.')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      await addPrescription(buildPayload(approve))
      navigate('/prescriptions')
    } catch (err) {
      setError(`Could not save the prescription: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function runInteractionCheck() {
    if (rxDraft.medicines.length === 0) {
      setError('Add at least one medicine before checking interactions.')
      return
    }

    setError('')
    setChecking(true)
    try {
      setInteractionResult(
        await checkInteractions({
          patient_id: patient.patient_id,
          medicines: rxDraft.medicines.map((item) => ({
            medicine_id: item.medicine_id,
            name: item.name,
            dosage: item.dosage,
            timings: item.timings,
            duration_days: item.duration_days ?? null,
          })),
        }),
      )
    } catch (err) {
      setError(`Could not check interactions: ${err.message}`)
    } finally {
      setChecking(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit(false)
      }}
      className="space-y-6"
    >
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

      {/* Upload a photo of the case paper; the floating assistant can also
          fill the draft below. */}
      <SectionCard title="Capture the prescription">
        <p className="mb-3 text-xs text-slate-500">
          Upload the case paper — medicines, vitals and diagnosis are filled in below for
          review.
        </p>

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

      <SectionCard title="Vitals, medicines & advice">
        {/* Vitals first, on one line, so they read as the header of the
            prescription rather than as a form of their own. */}
        <div className="flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">BP</span>
            <input
              className="field w-28"
              placeholder="130/85"
              value={vitals.bp}
              onChange={(event) =>
                setVitals((current) => ({ ...current, bp: event.target.value }))
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">SpO₂</span>
            <input
              className="field w-24"
              placeholder="98%"
              value={vitals.spo2}
              onChange={(event) =>
                setVitals((current) => ({ ...current, spo2: event.target.value }))
              }
            />
          </label>
        </div>

        <div className="my-4 border-t border-slate-100" />

        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_0.7fr_auto]">
          {draft.medicine_id === 'new' ? (
            <input
              className="field"
              placeholder="New medicine name"
              value={newMedicineName}
              onChange={(event) => setNewMedicineName(event.target.value)}
            />
          ) : (
            <select
              className="field"
              value={draft.medicine_id}
              onChange={(event) =>
                setDraft((current) => ({ ...current, medicine_id: event.target.value }))
              }
            >
              <option value="new">+ Add new medicine…</option>
              {medicines.map((medicine) => (
                <option key={medicine.id} value={medicine.id}>
                  {medicine.name} · {medicine.brand}
                </option>
              ))}
            </select>
          )}
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
          <input
            className="field"
            type="number"
            min="1"
            placeholder="Days"
            value={draft.days}
            onChange={(event) =>
              setDraft((current) => ({ ...current, days: event.target.value }))
            }
          />
          <Button
            type="button"
            variant="subtle"
            onClick={addItem}
            disabled={
              draft.medicine_id === 'new' ? !newMedicineName.trim() : !draft.medicine_id
            }
          >
            <Plus size={16} /> Add
          </Button>
        </div>

        {rxDraft.medicines.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-medium">Medicine</th>
                  <th className="px-3 py-2 font-medium">Dosage</th>
                  <th className="px-3 py-2 font-medium">Frequency</th>
                  <th className="px-3 py-2 font-medium">Days</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rxDraft.medicines.map((item, index) => (
                  <tr key={`${item.medicine_id ?? item.name}-${index}`}>
                    <td className="px-3 py-2">
                      <EditableCell
                        className="font-medium text-slate-800"
                        value={item.name}
                        onChange={(raw) => {
                          const name = raw.trim()
                          if (name) updateItem(index, { name })
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <EditableCell
                        className="text-slate-600"
                        value={item.dosage}
                        onChange={(raw) => updateItem(index, { dosage: raw.trim() })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <EditableCell
                        className="text-slate-600"
                        value={item.timings}
                        onChange={(raw) => updateItem(index, { timings: raw.trim() })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <EditableCell
                        className="text-slate-600"
                        type="number"
                        value={item.duration_days}
                        onChange={(raw) => {
                          const trimmed = raw.trim()
                          const days = trimmed === '' ? null : Number(trimmed)
                          updateItem(index, {
                            duration_days: Number.isFinite(days) ? days : null,
                          })
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setRxDraft((current) => ({
                            ...current,
                            medicines: current.medicines.filter((_, i) => i !== index),
                          }))
                        }
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 border-t border-slate-100 pt-4">
          <span className="mb-2 block text-xs font-medium text-slate-500">
            Next follow-up
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="date"
              className="field w-44"
              min={todayIso()}
              value={followUp.date}
              onChange={(event) =>
                setFollowUp((current) => ({
                  ...current,
                  date: event.target.value,
                  time: '',
                }))
              }
            />
            {followUp.time && (
              <span className="text-xs text-slate-500">
                Slot: {formatTime(followUp.time)}
              </span>
            )}
          </div>

          {followUp.date && (
            <div className="mt-3">
              {slotsState === 'loading' && (
                <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <Loader2 size={13} className="animate-spin" /> Checking availability…
                </p>
              )}

              {slotsState === 'error' && (
                <p className="text-xs text-rose-600">Could not load availability.</p>
              )}

              {slotsState === 'ready' && availableSlots.length === 0 && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  No free slots on {formatLongDate(followUp.date)}. Try another day.
                </p>
              )}

              {slotsState === 'ready' && availableSlots.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {availableSlots.map((slot) => {
                    const active = slot === followUp.time
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() =>
                          setFollowUp((current) => ({ ...current, time: slot }))
                        }
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
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
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <label className="block">
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
      </SectionCard>

      <SectionCard title="Symptoms & diagnosis">
        <textarea
          rows={4}
          className="field resize-none"
          placeholder="Symptoms, diagnosed condition, or any clinical detail…"
          value={rxDraft.diagnosis}
          onChange={(event) =>
            setRxDraft((current) => ({ ...current, diagnosis: event.target.value }))
          }
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={dictating ? 'danger' : 'ghost'}
            size="sm"
            onClick={() => (dictating ? stopDiagnosisDictation() : startDiagnosisDictation())}
          >
            {dictating ? (
              <>
                <Square size={14} /> Stop dictation
              </>
            ) : (
              <>
                <Mic size={15} /> Dictate
              </>
            )}
          </Button>
          {dictating && (
            <span className="text-xs font-medium text-rose-600">Listening…</span>
          )}
        </div>
        {dictationNotice && (
          <p className="mt-2 text-xs font-medium text-rose-600">{dictationNotice}</p>
        )}
        <p className="mt-2 text-xs text-slate-400">
          You can also ask the assistant (bottom-right) to fill this in — e.g. “set the
          diagnosis to anxiety”.
        </p>
      </SectionCard>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {interactionResult && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          {interactionResult.warnings.length > 0 ? (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                <AlertTriangle size={16} /> Drug interaction & allergy warnings
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
                {interactionResult.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Check size={16} className="text-emerald-600" />
              {interactionResult.interaction_note ?? 'No interactions found.'}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={runInteractionCheck}
          loading={checking}
          disabled={checking || rxDraft.medicines.length === 0}
        >
          <AlertTriangle size={15} /> Check drug interactions
        </Button>
        <Button type="button" variant="ghost" as={Link} to={`/patients/${patient.patient_id}`}>
          Cancel
        </Button>
        <Button type="submit" variant="subtle" loading={submitting} disabled={submitting}>
          {submitting ? 'Saving…' : 'Review'}
        </Button>
        <Button
          type="button"
          loading={submitting}
          disabled={submitting}
          onClick={() => submit(true)}
        >
          Review & Approve
        </Button>
      </div>
    </form>
  )
}
