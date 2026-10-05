/**
 * Tipos mínimos da Web Speech API (reconhecimento de fala), que ainda não
 * fazem parte das definições DOM padrão do TypeScript.
 */
export interface SpeechRecognitionAlternativeLike {
  transcript: string
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionAlternativeLike
}

export interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: { readonly length: number; [index: number]: SpeechRecognitionResultLike }
}

export interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

export function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Escolhe um formato de áudio suportado pelo navegador (Safari não grava webm). */
export function pickAudioMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  if (typeof MediaRecorder === 'undefined') return ''
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}
