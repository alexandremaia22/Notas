import { useCallback, useEffect, useRef, useState } from 'react'
import { summarizeTranscript } from '../lib/api'
import { formatDate, formatDuration } from '../lib/format'
import type { Recording } from '../lib/types'
import { Markdown } from './Markdown'

interface RecordingCardProps {
  recording: Recording
  aiConfigured: boolean
  onUpdate: (id: string, changes: Partial<Pick<Recording, 'title' | 'transcript' | 'summary'>>) => Promise<void>
  onDelete: (recording: Recording) => void
}

export function RecordingCard({ recording, aiConfigured, onUpdate, onDelete }: RecordingCardProps) {
  const [transcriptDraft, setTranscriptDraft] = useState(recording.transcript)
  const [showTranscript, setShowTranscript] = useState(false)
  const [streamingSummary, setStreamingSummary] = useState<string | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // O áudio fica no IndexedDB como Blob; a URL temporária é liberada quando o player sai da tela.
  const attachAudio = useCallback(
    (audio: HTMLAudioElement | null) => {
      if (!audio) return
      const url = URL.createObjectURL(recording.audio)
      // Gravações webm do Chrome não trazem a duração no arquivo; pular para o fim força o
      // navegador a calculá-la, e então voltamos ao início para a barra de progresso funcionar.
      const fixDuration = () => {
        if (audio.duration !== Infinity) return
        const reset = () => {
          audio.removeEventListener('durationchange', reset)
          audio.currentTime = 0
        }
        audio.addEventListener('durationchange', reset)
        audio.currentTime = Number.MAX_SAFE_INTEGER
      }
      audio.addEventListener('loadedmetadata', fixDuration)
      audio.src = url
      return () => {
        audio.removeEventListener('loadedmetadata', fixDuration)
        audio.removeAttribute('src')
        URL.revokeObjectURL(url)
      }
    },
    [recording.audio],
  )

  useEffect(() => () => abortRef.current?.abort(), [])

  const isSummarizing = streamingSummary !== null
  const summary = streamingSummary ?? recording.summary
  const hasTranscript = transcriptDraft.trim().length > 0

  const saveTranscript = async () => {
    if (transcriptDraft !== recording.transcript) await onUpdate(recording.id, { transcript: transcriptDraft })
  }

  const generateSummary = async () => {
    if (isSummarizing || !hasTranscript) return
    setSummaryError(null)
    setStreamingSummary('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await saveTranscript()
      const text = await summarizeTranscript(
        { transcript: transcriptDraft, title: recording.title },
        (accumulated) => setStreamingSummary(accumulated),
        controller.signal,
      )
      if (!text.trim()) throw new Error('O resumo voltou vazio. Tente novamente.')
      await onUpdate(recording.id, { summary: text })
    } catch (error) {
      if (controller.signal.aborted) return
      setSummaryError(error instanceof Error ? error.message : 'Erro inesperado ao gerar o resumo.')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (!controller.signal.aborted) setStreamingSummary(null)
    }
  }

  const rename = async () => {
    const title = window.prompt('Nome da aula', recording.title)?.trim()
    if (title && title !== recording.title) await onUpdate(recording.id, { title })
  }

  return (
    <article className="recording-card">
      <header className="recording-header">
        <div>
          <h3 className="recording-title">{recording.title}</h3>
          <p className="muted small-text">
            {formatDate(recording.createdAt)} · {formatDuration(recording.durationMs)}
          </p>
        </div>
        <div className="recording-actions">
          <button type="button" className="icon-button" title="Renomear aula" onClick={rename}>
            ✏️<span className="sr-only">Renomear aula</span>
          </button>
          <button type="button" className="icon-button" title="Excluir aula" onClick={() => onDelete(recording)}>
            🗑️<span className="sr-only">Excluir aula</span>
          </button>
        </div>
      </header>

      <audio ref={attachAudio} className="audio" controls preload="metadata" />

      <button type="button" className="link-button" onClick={() => setShowTranscript((value) => !value)}>
        {showTranscript ? 'Ocultar transcrição' : 'Ver/editar transcrição'}
      </button>
      {showTranscript && (
        <textarea
          className="transcript-editor"
          value={transcriptDraft}
          placeholder="Sem transcrição. Cole ou digite aqui o conteúdo da aula para gerar o resumo."
          onChange={(event) => setTranscriptDraft(event.target.value)}
          onBlur={() => void saveTranscript()}
          rows={8}
        />
      )}

      <div className="summary-actions">
        <button
          type="button"
          className="primary"
          onClick={() => void generateSummary()}
          disabled={!aiConfigured || !hasTranscript || isSummarizing}
          title={!aiConfigured ? 'Configure a chave da API no servidor' : undefined}
        >
          {isSummarizing ? 'Resumindo…' : recording.summary ? 'Gerar novo resumo' : '✨ Resumir aula'}
        </button>
        {!hasTranscript && <span className="muted small-text">Adicione a transcrição para resumir.</span>}
      </div>

      {summaryError && (
        <p className="error" role="alert">
          {summaryError}
        </p>
      )}
      {summary && (
        <section className="summary" aria-live={isSummarizing ? 'polite' : 'off'}>
          <Markdown text={summary} />
        </section>
      )}
    </article>
  )
}
