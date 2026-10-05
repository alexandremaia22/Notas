import type { Stroke } from './types'

/** Histórico de desfazer/refazer de uma página, guardando instantâneos imutáveis dos traços. */
export interface History {
  past: Stroke[][]
  present: Stroke[]
  future: Stroke[][]
}

const MAX_HISTORY = 100

export function createHistory(strokes: Stroke[]): History {
  return { past: [], present: strokes, future: [] }
}

export function commit(history: History, next: Stroke[]): History {
  if (next === history.present) return history
  const past = [...history.past, history.present]
  if (past.length > MAX_HISTORY) past.shift()
  return { past, present: next, future: [] }
}

export function undo(history: History): History {
  if (history.past.length === 0) return history
  const previous = history.past[history.past.length - 1]
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redo(history: History): History {
  if (history.future.length === 0) return history
  const [next, ...future] = history.future
  return { past: [...history.past, history.present], present: next, future }
}
