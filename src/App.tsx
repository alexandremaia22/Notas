import { useCallback, useEffect, useState } from 'react'
import { LecturePanel } from './components/LecturePanel'
import { NoteCanvas, type PenSettings } from './components/NoteCanvas'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { fetchHealth } from './lib/api'
import * as db from './lib/db'
import { commit, createHistory, redo, undo, type History } from './lib/history'
import type { Notebook, Page, Recording, Stroke } from './lib/types'

const DEFAULT_SETTINGS: PenSettings = { tool: 'pen', color: '#1f2937', width: 4 }

type RecordingChanges = Partial<Pick<Recording, 'title' | 'transcript' | 'summary'>>

export default function App() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [settings, setSettings] = useState<PenSettings>(DEFAULT_SETTINGS)
  const [aiConfigured, setAiConfigured] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reportError = useCallback((message: string) => (cause: unknown) => {
    console.error(message, cause)
    setError(message)
  }, [])

  // Carrega os cadernos (e cria o primeiro, se necessário).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const list = await db.ensureNotebook('Meu primeiro caderno')
      if (cancelled) return
      setNotebooks(list)
      setSelectedNotebookId((current) => current ?? list[0]?.id ?? null)
    }
    load().catch(reportError('Não foi possível abrir os cadernos salvos neste navegador.'))
    return () => {
      cancelled = true
    }
  }, [reportError])

  // Verifica se o servidor tem a chave da IA configurada.
  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then((health) => setAiConfigured(health.aiConfigured))
      .catch(() => setAiConfigured(false))
    return () => controller.abort()
  }, [])

  // Carrega páginas e gravações do caderno selecionado.
  useEffect(() => {
    if (!selectedNotebookId) return
    let cancelled = false
    Promise.all([db.listPages(selectedNotebookId), db.listRecordings(selectedNotebookId)])
      .then(([pageList, recordingList]) => {
        if (cancelled) return
        setPages(pageList)
        setRecordings(recordingList)
        const first = pageList[0] ?? null
        setSelectedPageId(first?.id ?? null)
        setHistory(first ? createHistory(first.strokes) : null)
      })
      .catch(reportError('Não foi possível carregar o caderno.'))
    return () => {
      cancelled = true
    }
  }, [selectedNotebookId, reportError])

  const persistStrokes = useCallback(
    (pageId: string, strokes: Stroke[]) => {
      setPages((list) => list.map((page) => (page.id === pageId ? { ...page, strokes } : page)))
      db.savePageStrokes(pageId, strokes).catch(reportError('Não foi possível salvar a página.'))
    },
    [reportError],
  )

  const applyHistory = useCallback(
    (update: (current: History) => History) => {
      if (!history || !selectedPageId) return
      const next = update(history)
      if (next === history) return
      setHistory(next)
      persistStrokes(selectedPageId, next.present)
    },
    [history, selectedPageId, persistStrokes],
  )

  const handleCommit = useCallback((strokes: Stroke[]) => applyHistory((h) => commit(h, strokes)), [applyHistory])
  const handleUndo = useCallback(() => applyHistory(undo), [applyHistory])
  const handleRedo = useCallback(() => applyHistory(redo), [applyHistory])
  const handleClear = useCallback(() => {
    if (history && history.present.length > 0 && window.confirm('Limpar todos os traços desta página?')) {
      applyHistory((h) => commit(h, []))
    }
  }, [history, applyHistory])

  // Atalhos: Ctrl/Cmd+Z desfaz, Ctrl/Cmd+Shift+Z ou Ctrl+Y refaz.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) return
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo, handleRedo])

  const selectPage = (pageId: string) => {
    const page = pages.find((p) => p.id === pageId)
    if (!page) return
    setSelectedPageId(page.id)
    setHistory(createHistory(page.strokes))
  }

  const createNotebook = async () => {
    const title = window.prompt('Nome do caderno (ex.: Cálculo I)')?.trim()
    if (!title) return
    try {
      const { notebook } = await db.createNotebook(title)
      setNotebooks(await db.listNotebooks())
      setSelectedNotebookId(notebook.id)
    } catch (cause) {
      reportError('Não foi possível criar o caderno.')(cause)
    }
  }

  const renameNotebook = async (notebook: Notebook) => {
    const title = window.prompt('Novo nome do caderno', notebook.title)?.trim()
    if (!title || title === notebook.title) return
    try {
      await db.renameNotebook(notebook.id, title)
      setNotebooks(await db.listNotebooks())
    } catch (cause) {
      reportError('Não foi possível renomear o caderno.')(cause)
    }
  }

  const deleteNotebook = async (notebook: Notebook) => {
    if (!window.confirm(`Excluir "${notebook.title}" com todas as páginas e aulas gravadas?`)) return
    try {
      await db.deleteNotebook(notebook.id)
      const list = await db.ensureNotebook('Meu caderno')
      setNotebooks(list)
      if (notebook.id === selectedNotebookId) setSelectedNotebookId(list[0].id)
    } catch (cause) {
      reportError('Não foi possível excluir o caderno.')(cause)
    }
  }

  const addPage = async () => {
    if (!selectedNotebookId) return
    try {
      const page = await db.addPage(selectedNotebookId)
      setPages((list) => [...list, page])
      setSelectedPageId(page.id)
      setHistory(createHistory(page.strokes))
    } catch (cause) {
      reportError('Não foi possível adicionar a página.')(cause)
    }
  }

  const deletePage = async (page: Page) => {
    if (pages.length <= 1 || !window.confirm('Excluir esta página?')) return
    try {
      await db.deletePage(page.id)
      const remaining = pages.filter((p) => p.id !== page.id)
      setPages(remaining)
      if (page.id === selectedPageId) {
        setSelectedPageId(remaining[0].id)
        setHistory(createHistory(remaining[0].strokes))
      }
    } catch (cause) {
      reportError('Não foi possível excluir a página.')(cause)
    }
  }

  const saveRecording = async (recording: Recording) => {
    await db.saveRecording(recording)
    if (recording.notebookId === selectedNotebookId) setRecordings((list) => [recording, ...list])
  }

  const updateRecording = async (id: string, changes: RecordingChanges) => {
    try {
      const updated = await db.updateRecording(id, changes)
      setRecordings((list) => list.map((r) => (r.id === id ? updated : r)))
    } catch (cause) {
      reportError('Não foi possível salvar as alterações da aula.')(cause)
    }
  }

  const deleteRecording = async (recording: Recording) => {
    if (!window.confirm(`Excluir a gravação "${recording.title}"?`)) return
    try {
      await db.deleteRecording(recording.id)
      setRecordings((list) => list.filter((r) => r.id !== recording.id))
    } catch (cause) {
      reportError('Não foi possível excluir a gravação.')(cause)
    }
  }

  return (
    <div className="app">
      <Sidebar
        notebooks={notebooks}
        pages={pages}
        selectedNotebookId={selectedNotebookId}
        selectedPageId={selectedPageId}
        onSelectNotebook={setSelectedNotebookId}
        onCreateNotebook={() => void createNotebook()}
        onRenameNotebook={(notebook) => void renameNotebook(notebook)}
        onDeleteNotebook={(notebook) => void deleteNotebook(notebook)}
        onSelectPage={selectPage}
        onAddPage={() => void addPage()}
        onDeletePage={(page) => void deletePage(page)}
      />

      <main className="workspace">
        {error && (
          <div className="error banner" role="alert">
            {error}
            <button type="button" className="icon-button" onClick={() => setError(null)} title="Fechar">
              ✕<span className="sr-only">Fechar aviso</span>
            </button>
          </div>
        )}
        <Toolbar
          settings={settings}
          onChange={setSettings}
          canUndo={!!history && history.past.length > 0}
          canRedo={!!history && history.future.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleClear}
        />
        {history && selectedPageId ? (
          <NoteCanvas key={selectedPageId} strokes={history.present} settings={settings} onCommit={handleCommit} />
        ) : (
          <p className="muted center">Carregando…</p>
        )}
      </main>

      {selectedNotebookId && (
        <LecturePanel
          notebookId={selectedNotebookId}
          recordings={recordings}
          aiConfigured={aiConfigured}
          onSave={saveRecording}
          onUpdate={updateRecording}
          onDelete={(recording) => void deleteRecording(recording)}
        />
      )}
    </div>
  )
}
