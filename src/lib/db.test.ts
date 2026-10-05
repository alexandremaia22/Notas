import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import * as db from './db'
import type { Recording } from './types'

const recording = (notebookId: string, overrides: Partial<Recording> = {}): Recording => ({
  id: crypto.randomUUID(),
  notebookId,
  title: 'Aula',
  createdAt: Date.now(),
  durationMs: 1000,
  mimeType: 'audio/webm',
  audio: new Blob(['audio'], { type: 'audio/webm' }),
  transcript: 'conteúdo',
  summary: null,
  ...overrides,
})

beforeEach(async () => {
  await db.resetDbForTests()
  globalThis.indexedDB = new IDBFactory()
})

describe('db', () => {
  it('cria caderno com uma página vazia', async () => {
    const { notebook, page } = await db.createNotebook('Física')
    expect(await db.listNotebooks()).toEqual([notebook])
    expect(await db.listPages(notebook.id)).toEqual([page])
  })

  it('adiciona páginas em ordem e salva traços', async () => {
    const { notebook } = await db.createNotebook('Química')
    const second = await db.addPage(notebook.id)
    expect(second.index).toBe(1)
    const strokes = [{ id: 's', tool: 'pen' as const, color: '#000', width: 2, points: [{ x: 1, y: 2, p: 0.5 }] }]
    await db.savePageStrokes(second.id, strokes)
    const pages = await db.listPages(notebook.id)
    expect(pages.map((p) => p.index)).toEqual([0, 1])
    expect(pages[1].strokes).toEqual(strokes)
  })

  it('exclui o caderno com páginas e gravações', async () => {
    const { notebook } = await db.createNotebook('História')
    const { notebook: other } = await db.createNotebook('Geografia')
    await db.saveRecording(recording(notebook.id))
    await db.saveRecording(recording(other.id))
    await db.deleteNotebook(notebook.id)
    expect((await db.listNotebooks()).map((n) => n.id)).toEqual([other.id])
    expect(await db.listPages(notebook.id)).toEqual([])
    expect(await db.listRecordings(notebook.id)).toEqual([])
    expect(await db.listRecordings(other.id)).toHaveLength(1)
  })

  it('recusa gravação de caderno inexistente', async () => {
    await expect(db.saveRecording(recording('inexistente'))).rejects.toThrow('excluído')
  })

  it('atualiza transcrição e resumo da gravação', async () => {
    const { notebook } = await db.createNotebook('Biologia')
    const r = recording(notebook.id)
    await db.saveRecording(r)
    const updated = await db.updateRecording(r.id, { summary: '## Resumo' })
    expect(updated.summary).toBe('## Resumo')
    expect((await db.listRecordings(notebook.id))[0].summary).toBe('## Resumo')
  })

  it('lista gravações da mais nova para a mais antiga', async () => {
    const { notebook } = await db.createNotebook('Artes')
    await db.saveRecording(recording(notebook.id, { title: 'antiga', createdAt: 1 }))
    await db.saveRecording(recording(notebook.id, { title: 'nova', createdAt: 2 }))
    expect((await db.listRecordings(notebook.id)).map((r) => r.title)).toEqual(['nova', 'antiga'])
  })
})

describe('ensureNotebook', () => {
  it('cria só um caderno mesmo com chamadas simultâneas', async () => {
    const [a, b] = await Promise.all([db.ensureNotebook('Primeiro'), db.ensureNotebook('Primeiro')])
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
    expect(await db.listPages(a[0].id)).toHaveLength(1)
  })

  it('não cria caderno quando já existe um', async () => {
    await db.createNotebook('Existente')
    expect((await db.ensureNotebook('Novo')).map((n) => n.title)).toEqual(['Existente'])
  })
})
