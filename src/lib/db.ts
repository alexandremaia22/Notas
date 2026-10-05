import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { createId } from './format'
import type { Notebook, Page, Recording, Stroke } from './types'

interface NotasDB extends DBSchema {
  notebooks: { key: string; value: Notebook; indexes: { byUpdatedAt: number } }
  pages: { key: string; value: Page; indexes: { byNotebook: string } }
  recordings: { key: string; value: Recording; indexes: { byNotebook: string } }
}

const DB_NAME = 'notas'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<NotasDB>> | null = null

function getDb(): Promise<IDBPDatabase<NotasDB>> {
  dbPromise ??= openDB<NotasDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const notebooks = db.createObjectStore('notebooks', { keyPath: 'id' })
      notebooks.createIndex('byUpdatedAt', 'updatedAt')
      const pages = db.createObjectStore('pages', { keyPath: 'id' })
      pages.createIndex('byNotebook', 'notebookId')
      const recordings = db.createObjectStore('recordings', { keyPath: 'id' })
      recordings.createIndex('byNotebook', 'notebookId')
    },
  })
  return dbPromise
}

/** Usado apenas em testes para começar de um banco limpo. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close()
  dbPromise = null
}

export async function listNotebooks(): Promise<Notebook[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('notebooks', 'byUpdatedAt')
  return all.reverse()
}

export async function createNotebook(title: string): Promise<{ notebook: Notebook; page: Page }> {
  const db = await getDb()
  const now = Date.now()
  const notebook: Notebook = { id: createId(), title, createdAt: now, updatedAt: now }
  const page: Page = { id: createId(), notebookId: notebook.id, index: 0, strokes: [], updatedAt: now }
  const tx = db.transaction(['notebooks', 'pages'], 'readwrite')
  await Promise.all([tx.objectStore('notebooks').add(notebook), tx.objectStore('pages').add(page), tx.done])
  return { notebook, page }
}

/**
 * Garante que exista pelo menos um caderno. Roda em uma única transação de escrita,
 * então chamadas simultâneas (ex.: efeitos duplicados do React) não criam dois cadernos.
 */
export async function ensureNotebook(defaultTitle: string): Promise<Notebook[]> {
  const db = await getDb()
  const tx = db.transaction(['notebooks', 'pages'], 'readwrite')
  const count = await tx.objectStore('notebooks').count()
  if (count === 0) {
    const now = Date.now()
    const notebook: Notebook = { id: createId(), title: defaultTitle, createdAt: now, updatedAt: now }
    const page: Page = { id: createId(), notebookId: notebook.id, index: 0, strokes: [], updatedAt: now }
    await Promise.all([tx.objectStore('notebooks').add(notebook), tx.objectStore('pages').add(page)])
  }
  await tx.done
  return listNotebooks()
}

export async function renameNotebook(id: string, title: string): Promise<Notebook> {
  const db = await getDb()
  const notebook = await db.get('notebooks', id)
  if (!notebook) throw new Error('Caderno não encontrado.')
  const updated: Notebook = { ...notebook, title, updatedAt: Date.now() }
  await db.put('notebooks', updated)
  return updated
}

export async function deleteNotebook(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['notebooks', 'pages', 'recordings'], 'readwrite')
  const pageKeys = await tx.objectStore('pages').index('byNotebook').getAllKeys(id)
  const recordingKeys = await tx.objectStore('recordings').index('byNotebook').getAllKeys(id)
  await Promise.all([
    tx.objectStore('notebooks').delete(id),
    ...pageKeys.map((key) => tx.objectStore('pages').delete(key)),
    ...recordingKeys.map((key) => tx.objectStore('recordings').delete(key)),
    tx.done,
  ])
}

async function touchNotebook(db: IDBPDatabase<NotasDB>, id: string, at: number): Promise<void> {
  const notebook = await db.get('notebooks', id)
  if (notebook) await db.put('notebooks', { ...notebook, updatedAt: at })
}

export async function listPages(notebookId: string): Promise<Page[]> {
  const db = await getDb()
  const pages = await db.getAllFromIndex('pages', 'byNotebook', notebookId)
  return pages.sort((a, b) => a.index - b.index)
}

export async function addPage(notebookId: string): Promise<Page> {
  const db = await getDb()
  const existing = await listPages(notebookId)
  const now = Date.now()
  const lastIndex = existing.length > 0 ? existing[existing.length - 1].index : -1
  const page: Page = { id: createId(), notebookId, index: lastIndex + 1, strokes: [], updatedAt: now }
  await db.add('pages', page)
  await touchNotebook(db, notebookId, now)
  return page
}

export async function deletePage(pageId: string): Promise<void> {
  const db = await getDb()
  await db.delete('pages', pageId)
}

export async function savePageStrokes(pageId: string, strokes: Stroke[]): Promise<void> {
  const db = await getDb()
  const page = await db.get('pages', pageId)
  if (!page) return
  const now = Date.now()
  await db.put('pages', { ...page, strokes, updatedAt: now })
  await touchNotebook(db, page.notebookId, now)
}

export async function listRecordings(notebookId: string): Promise<Recording[]> {
  const db = await getDb()
  const recordings = await db.getAllFromIndex('recordings', 'byNotebook', notebookId)
  return recordings.sort((a, b) => b.createdAt - a.createdAt)
}

export async function saveRecording(recording: Recording): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['notebooks', 'recordings'], 'readwrite')
  const notebook = await tx.objectStore('notebooks').get(recording.notebookId)
  if (!notebook) {
    tx.abort()
    await tx.done.catch(() => undefined)
    throw new Error('O caderno desta gravação foi excluído.')
  }
  await Promise.all([
    tx.objectStore('recordings').put(recording),
    tx.objectStore('notebooks').put({ ...notebook, updatedAt: Date.now() }),
    tx.done,
  ])
}

export async function updateRecording(
  id: string,
  changes: Partial<Pick<Recording, 'title' | 'transcript' | 'summary'>>,
): Promise<Recording> {
  const db = await getDb()
  const recording = await db.get('recordings', id)
  if (!recording) throw new Error('Gravação não encontrada.')
  const updated: Recording = { ...recording, ...changes }
  await db.put('recordings', updated)
  return updated
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('recordings', id)
}
