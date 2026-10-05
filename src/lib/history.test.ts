import { describe, expect, it } from 'vitest'
import { commit, createHistory, redo, undo } from './history'
import type { Stroke } from './types'

const s = (id: string): Stroke => ({ id, tool: 'pen', color: '#000', width: 2, points: [] })

describe('history', () => {
  it('desfaz e refaz na ordem correta', () => {
    let h = createHistory([])
    h = commit(h, [s('a')])
    h = commit(h, [s('a'), s('b')])
    h = undo(h)
    expect(h.present.map((x) => x.id)).toEqual(['a'])
    h = undo(h)
    expect(h.present).toEqual([])
    h = redo(h)
    expect(h.present.map((x) => x.id)).toEqual(['a'])
  })

  it('descarta o futuro ao registrar uma nova alteração', () => {
    let h = commit(createHistory([]), [s('a')])
    h = undo(h)
    h = commit(h, [s('b')])
    expect(h.future).toEqual([])
    expect(redo(h)).toBe(h)
  })

  it('não altera nada quando não há o que desfazer ou refazer', () => {
    const h = createHistory([s('a')])
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })

  it('ignora commits sem mudança', () => {
    const strokes = [s('a')]
    const h = createHistory(strokes)
    expect(commit(h, strokes)).toBe(h)
  })

  it('limita o tamanho do histórico', () => {
    let h = createHistory([])
    for (let i = 0; i < 150; i++) h = commit(h, [s(String(i))])
    expect(h.past.length).toBe(100)
  })
})
