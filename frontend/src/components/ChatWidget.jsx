import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Mic, Send, Square, X } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { chatWithDraft } from '../lib/api'
import { useDictation } from '../lib/useDictation'
import Button from './Button'

function patientIdFrom(pathname) {
  const match = String(pathname).match(/\/patients\/(\d+)/)
  return match ? Number(match[1]) : null
}

export default function ChatWidget() {
  const { draft, setDraft, patients, currentPatientId } = useApp()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [chatting, setChatting] = useState(false)

  const patientId = patientIdFrom(pathname) ?? currentPatientId
  const patient =
    patientId != null ? patients.find((p) => p.patient_id === patientId) : null

  const { start, stop, listening, notice } = useDictation(setInput)

  const scrollRef = useRef(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, open])

  // A new patient means a fresh conversation.
  useEffect(() => {
    setMessages([])
  }, [patientId])

  async function send(text) {
    const message = (text ?? input).trim()
    if (!message || chatting) return

    setInput('')
    const history = messages.map((m) => ({ role: m.role, text: m.text }))
    setMessages((prev) => [...prev, { role: 'user', text: message }])
    setChatting(true)

    try {
      const result = await chatWithDraft({
        draft: {
          diagnosis: draft.diagnosis || null,
          lab_test: null,
          medicines: draft.medicines.map((m) => ({
            medicine_id: m.medicine_id ?? null,
            name: m.name,
            dosage: m.dosage,
            timings: m.timings,
            duration_days: m.duration_days ?? null,
          })),
        },
        message,
        history,
        patient_id: patientId,
      })

      setDraft({
        diagnosis: result.draft?.diagnosis ?? '',
        medicines: (result.draft?.medicines ?? []).map((m) => ({
          medicine_id: m.medicine_id ?? null,
          name: m.name ?? '',
          dosage: m.dosage ?? '—',
          timings: m.timings ?? '—',
          duration_days: m.duration_days ?? null,
        })),
      })
      setMessages((prev) => [...prev, { role: 'assistant', text: result.reply }])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Assistant unavailable: ${err.message}`, error: true },
      ])
    } finally {
      setChatting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-full border border-slate-200 bg-white py-2.5 pl-2.5 pr-5 shadow-lg transition-shadow hover:shadow-xl"
      >
        <img src="/logo.png" alt="" className="h-9 w-9 rounded-full" />
        <span className="text-sm font-medium text-slate-700">Click here to chat</span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex w-[min(92vw,24rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">Assistant</p>
          <p className="truncate text-xs text-slate-500">
            {patient ? `${patient.name} · #${patient.patient_id}` : 'Prescribing assistant'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100"
          aria-label="Close chat"
        >
          <X size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="h-72 space-y-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="text-center text-xs text-slate-400">
            {patient
              ? `Ask about ${patient.name}'s diseases, family history or prescriptions — or add medicines to the current draft.`
              : 'Open a patient record first, then ask about their diseases, family history or prescriptions.'}
          </p>
        )}
        {messages.map((message, index) => (
          <div
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
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 p-3">
        <div className="flex gap-2">
          <input
            className="field"
            placeholder='Ask or say: "what diseases does this patient have?"'
            value={input}
            disabled={chatting}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') send()
            }}
          />
          <Button
            type="button"
            variant={listening ? 'danger' : 'ghost'}
            onClick={() => (listening ? stop() : start())}
            title="Dictate"
          >
            {listening ? <Square size={15} /> : <Mic size={15} />}
          </Button>
          <Button
            type="button"
            loading={chatting}
            disabled={chatting || !input.trim()}
            onClick={() => send()}
          >
            <Send size={15} /> Send
          </Button>
        </div>
        {notice && <p className="mt-2 text-xs font-medium text-rose-600">{notice}</p>}
      </div>
    </div>
  )
}
