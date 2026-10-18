import { useEffect, useRef, useState } from 'react'
import { Mic, Send, Square, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { patientAssistant } from '../../lib/api'
import { useDictation } from '../../lib/useDictation'
import Button from '../../components/Button'

/**
 * Floating patient assistant. Answers questions grounded in the patient's own
 * record and their family's: medicines, reorders, appointments, allergies,
 * conditions and drug interactions.
 */
export default function PatientChatWidget() {
  const { patientId, patients } = useApp()
  const me = patients.find((p) => p.patient_id === patientId)

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [chatting, setChatting] = useState(false)

  const { start, stop, listening, notice } = useDictation(setInput)

  const scrollRef = useRef(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, open])

  async function send(text) {
    const message = (text ?? input).trim()
    if (!message || chatting || patientId == null) return

    setInput('')
    const history = messages.map((m) => ({ role: m.role, text: m.text }))
    setMessages((prev) => [...prev, { role: 'user', text: message }])
    setChatting(true)

    try {
      const result = await patientAssistant(patientId, message, history)
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

  if (patientId == null) return null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 flex items-center gap-3 rounded-full border border-slate-200 bg-white py-2.5 pl-2.5 pr-5 shadow-lg transition-shadow hover:shadow-xl"
      >
        <img src="/logo.png" alt="" className="h-9 w-9 rounded-full" />
        <span className="text-sm font-medium text-slate-700">Ask about your health</span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-24 right-4 z-40 flex w-[min(92vw,24rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">Assistant</p>
          <p className="truncate text-xs text-slate-500">
            {me ? `${me.name} · #${me.patient_id}` : 'Your health assistant'}
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
            Ask anything — what medicines you take, what needs reordering, upcoming
            appointments, allergies or conditions for you and your family.
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
            placeholder='Ask: "what do I need to reorder?"'
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
