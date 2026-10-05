import { useCallback, useEffect, useRef, useState } from 'react'
import { appendTranscript } from '../lib/format'
import { getSpeechRecognition, pickAudioMimeType, type SpeechRecognitionLike } from '../lib/speech'

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'stopping'

export interface FinishedRecording {
  audio: Blob
  mimeType: string
  durationMs: number
  transcript: string
}

interface Session {
  stream: MediaStream
  recorder: MediaRecorder
  chunks: Blob[]
  recognition: SpeechRecognitionLike | null
  recognitionEnded: Promise<void>
  startedAt: number
  active: boolean
}

const RECOGNITION_STOP_TIMEOUT_MS = 2000

const FATAL_SPEECH_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported'])

export function useLectureRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [speechWarning, setSpeechWarning] = useState<string | null>(null)

  const sessionRef = useRef<Session | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const transcriptRef = useRef('')
  const interimRef = useRef('')

  const speechSupported = getSpeechRecognition() !== null
  const recordingSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'

  useEffect(() => {
    if (status !== 'recording') return
    const timer = window.setInterval(() => {
      const session = sessionRef.current
      if (session) setElapsedMs(Date.now() - session.startedAt)
    }, 500)
    return () => window.clearInterval(timer)
  }, [status])

  // Mantém a tela acesa durante a aula: no celular, a gravação para quando a tela apaga.
  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator) || wakeLockRef.current) return
    try {
      const sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null
      })
      wakeLockRef.current = sentinel
    } catch {
      // Sem permissão ou sem suporte: segue gravando normalmente.
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current
    wakeLockRef.current = null
    sentinel?.release().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (status !== 'recording') return
    // O navegador solta a trava quando a aba fica oculta; pede de novo ao voltar.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquireWakeLock()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [status, acquireWakeLock])

  const createRecognition = useCallback((session: Session): Promise<void> => {
    const Recognition = getSpeechRecognition()
    if (!Recognition) return Promise.resolve()

    const recognition = new Recognition()
    recognition.lang = 'pt-BR'
    recognition.continuous = true
    recognition.interimResults = true
    session.recognition = recognition

    return new Promise<void>((resolve) => {
      recognition.onresult = (event) => {
        let interimText = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const text = result[0]?.transcript ?? ''
          if (result.isFinal) {
            transcriptRef.current = appendTranscript(transcriptRef.current, text)
          } else {
            interimText += text
          }
        }
        interimRef.current = interimText.trim()
        setTranscript(transcriptRef.current)
        setInterim(interimRef.current)
      }
      recognition.onerror = (event) => {
        if (FATAL_SPEECH_ERRORS.has(event.error)) {
          session.recognition = null
          setSpeechWarning(
            'A transcrição ao vivo foi bloqueada pelo navegador. O áudio continua sendo gravado e você pode colar ou digitar a transcrição depois.',
          )
        } else if (event.error === 'network') {
          setSpeechWarning('A transcrição ao vivo perdeu a conexão. Tentando continuar…')
        }
      }
      recognition.onend = () => {
        // O Chrome encerra o reconhecimento após silêncio; reinicia enquanto a aula continua.
        if (session.active && session.recognition === recognition) {
          try {
            recognition.start()
            return
          } catch {
            session.recognition = null
          }
        }
        resolve()
      }
      try {
        recognition.start()
      } catch {
        session.recognition = null
        resolve()
      }
    })
  }, [])

  const start = useCallback(async () => {
    if (sessionRef.current || !recordingSupported) return
    setError(null)
    setSpeechWarning(null)
    setStatus('starting')
    transcriptRef.current = ''
    interimRef.current = ''
    setTranscript('')
    setInterim('')
    setElapsedMs(0)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Não foi possível acessar o microfone. Verifique a permissão do navegador.')
      setStatus('idle')
      return
    }

    const mimeType = pickAudioMimeType()
    let recorder: MediaRecorder
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    } catch {
      stream.getTracks().forEach((track) => track.stop())
      setError('Este navegador não consegue gravar áudio.')
      setStatus('idle')
      return
    }

    const session: Session = {
      stream,
      recorder,
      chunks: [],
      recognition: null,
      recognitionEnded: Promise.resolve(),
      startedAt: Date.now(),
      active: true,
    }
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) session.chunks.push(event.data)
    }
    recorder.start(1000)
    sessionRef.current = session
    session.recognitionEnded = createRecognition(session)
    setStatus('recording')
    void acquireWakeLock()
  }, [acquireWakeLock, createRecognition, recordingSupported])

  const stop = useCallback(async (): Promise<FinishedRecording | null> => {
    const session = sessionRef.current
    if (!session || !session.active) return null
    session.active = false
    setStatus('stopping')

    const recorderStopped = new Promise<void>((resolve) => {
      session.recorder.onstop = () => resolve()
    })
    if (session.recorder.state !== 'inactive') session.recorder.stop()
    session.recognition?.stop()

    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, RECOGNITION_STOP_TIMEOUT_MS))
    await Promise.all([recorderStopped, Promise.race([session.recognitionEnded, timeout])])
    session.recognition?.abort()
    session.stream.getTracks().forEach((track) => track.stop())
    releaseWakeLock()

    // Trechos ainda não finalizados pelo reconhecedor também entram na transcrição.
    const finalTranscript = appendTranscript(transcriptRef.current, interimRef.current)
    const mimeType = session.recorder.mimeType || session.chunks[0]?.type || 'audio/webm'
    const result: FinishedRecording = {
      audio: new Blob(session.chunks, { type: mimeType }),
      mimeType,
      durationMs: Date.now() - session.startedAt,
      transcript: finalTranscript,
    }

    sessionRef.current = null
    transcriptRef.current = ''
    interimRef.current = ''
    setTranscript('')
    setInterim('')
    setElapsedMs(0)
    setStatus('idle')
    return result
  }, [releaseWakeLock])

  useEffect(() => {
    return () => {
      const session = sessionRef.current
      if (!session) return
      session.active = false
      session.recognition?.abort()
      if (session.recorder.state !== 'inactive') session.recorder.stop()
      session.stream.getTracks().forEach((track) => track.stop())
      sessionRef.current = null
      wakeLockRef.current?.release().catch(() => undefined)
      wakeLockRef.current = null
    }
  }, [])

  return {
    status,
    elapsedMs,
    transcript,
    interim,
    error,
    speechWarning,
    speechSupported,
    recordingSupported,
    start,
    stop,
  }
}
