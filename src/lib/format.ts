export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(timestamp: number): string {
  return dateFormatter.format(timestamp)
}

/** Junta pedaços de transcrição, normalizando espaços. */
export function appendTranscript(current: string, chunk: string): string {
  const clean = chunk.replace(/\s+/g, ' ').trim()
  if (!clean) return current
  return current ? `${current} ${clean}` : clean
}

export function createId(): string {
  return crypto.randomUUID()
}
