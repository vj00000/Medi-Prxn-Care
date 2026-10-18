import { useCallback, useEffect, useRef, useState } from 'react'

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null
  const win = window
  const Recognition =
    win.SpeechRecognition || win.webkitSpeechRecognition || null
  return Recognition ? new Recognition() : null
}

/**
 * Browser speech-to-text, shared by the chat widget and the symptoms field.
 *
 * `onResult` fires with the final transcript (interim updates are ignored so
 * append-style consumers don't get duplicated text). No backend call, so it
 * costs no Gemini quota.
 */
export function useDictation(onResult) {
  const [listening, setListening] = useState(false)
  const [notice, setNotice] = useState('')
  const recognitionRef = useRef(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    setListening(false)
    if (recognition) {
      try {
        recognition.stop()
      } catch {
        // already stopped — nothing to do
      }
    }
  }, [])

  const start = useCallback(() => {
    if (recognitionRef.current) {
      stop()
      return
    }

    const recognition = getSpeechRecognition()
    if (!recognition) {
      setNotice('Voice input needs Chrome, Edge or Safari.')
      return
    }

    setNotice('')
    recognition.lang = 'en-IN'
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onresult = (event) => {
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript
      }
      const spoken = finalText.trim()
      if (spoken) onResultRef.current(spoken)
    }
    recognition.onerror = (event) => {
      setNotice(
        event.error === 'not-allowed'
          ? 'Microphone permission denied.'
          : `Voice input error: ${event.error}`,
      )
      stop()
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch (error) {
      recognitionRef.current = null
      setListening(false)
      setNotice(`Could not start voice input: ${error.message}`)
    }
  }, [stop])

  useEffect(() => () => stop(), [stop])

  return { start, stop, listening, notice }
}
