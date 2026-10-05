import { useRef, useState } from 'react'
import { useLectureRecorder } from '../hooks/useLectureRecorder'
import { createId, formatDate, formatDuration } from '../lib/format'
import type { Recording } from '../lib/types'
import { RecordingCard } from './RecordingCard'

interface LecturePanelProps {
  notebookId: string
  recordings: Recording[]
  aiConfigured: boolean
  onSave: (recording: Recording) => Promise<void>
  onUpdate: (id: string, changes: Partial<Pick<Recording, 'title' | 'transcript' | 'summary'>>) => Promise<void>
  onDelete: (recording: Recording) => void
}

export function LecturePanel({ notebookId, recordings, aiConfigured, onSave, onUpdate, onDelete }: LecturePanelProps) {
  const recorder = useLectureRecorder()
  const [saveError, setSaveError] = useState<string | null>(null)
  // A aula pertence ao caderno aberto quando a gravação começou, mesmo que o usuário troque de caderno.
  const recordingNotebookRef = useRef(notebookId)
  const isRecording = recorder.status === 'recording'
  const isBusy = recorder.status === 'starting' || recorder.status === 'stopping'

  const handleStart = async () => {
    recordingNotebookRef.current = notebookId
    setSaveError(null)
    await recorder.start()
  }

  const handleStop = async () => {
    const finished = await recorder.stop()
    if (!finished) return
    const createdAt = Date.now() - finished.durationMs
    try {
      setSaveError(null)
      await onSave({
        id: createId(),
        notebookId: recordingNotebookRef.current,
        title: `Aula de ${formatDate(createdAt)}`,
        createdAt,
        durationMs: finished.durationMs,
        mimeType: finished.mimeType,
        audio: finished.audio,
        transcript: finished.transcript,
        summary: null,
      })
    } catch {
      setSaveError('Não foi possível salvar a gravação. Verifique o espaço disponível no navegador.')
    }
  }

  return (
    <aside className="lecture-panel" aria-label="Gravação de aulas">
      <h2 className="section-title">🎙️ Aula</h2>

      {!recorder.recordingSupported ? (
        <p className="error">Este navegador não permite gravar áudio.</p>
      ) : (
        <div className="recorder">
          <button
            type="button"
            className={isRecording ? 'record-button recording' : 'record-button'}
            onClick={() => void (isRecording ? handleStop() : handleStart())}
            disabled={isBusy}
          >
            {isRecording ? '■ Parar' : recorder.status === 'stopping' ? 'Salvando…' : '● Gravar aula'}
          </button>
          {isRecording && <span className="timer">{formatDuration(recorder.elapsedMs)}</span>}
        </div>
      )}

      {!recorder.speechSupported && (
        <p className="warning small-text">
          A transcrição ao vivo funciona no Chrome e no Edge. Aqui o áudio é gravado e você pode colar a transcrição
          depois.
        </p>
      )}
      {recorder.error && (
        <p className="error" role="alert">
          {recorder.error}
        </p>
      )}
      {recorder.speechWarning && <p className="warning small-text">{recorder.speechWarning}</p>}
      {saveError && (
        <p className="error" role="alert">
          {saveError}
        </p>
      )}

      {isRecording && recorder.speechSupported && (
        <div className="live-transcript" aria-live="polite">
          {recorder.transcript || recorder.interim ? (
            <>
              {recorder.transcript} <span className="interim">{recorder.interim}</span>
            </>
          ) : (
            <span className="muted">Ouvindo… a transcrição aparece aqui.</span>
          )}
        </div>
      )}

      {!aiConfigured && (
        <p className="muted small-text">
          Depois de gravar, toque em <strong>Copiar transcrição</strong> e cole na aula do Caderno de Estudos para
          resumir, analisar os slides e criar flashcards.
        </p>
      )}

      <div className="recordings">
        {recordings.map((recording) => (
          <RecordingCard
            key={recording.id}
            recording={recording}
            aiConfigured={aiConfigured}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
        {recordings.length === 0 && !isRecording && (
          <p className="muted small-text">Grave uma aula para ter a transcrição e um resumo fácil de estudar.</p>
        )}
      </div>
    </aside>
  )
}
