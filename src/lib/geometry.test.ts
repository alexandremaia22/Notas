import { describe, expect, it } from 'vitest'
import { distanceToSegment, eraseAt, normalizePressure, strokeHitTest } from './geometry'
import type { Stroke } from './types'

const stroke = (id: string, points: [number, number][], width = 4): Stroke => ({
  id,
  tool: 'pen',
  color: '#000',
  width,
  points: points.map(([x, y]) => ({ x, y, p: 0.5 })),
})

describe('distanceToSegment', () => {
  it('mede a distância perpendicular ao segmento', () => {
    expect(distanceToSegment({ x: 5, y: 3, p: 0 }, { x: 0, y: 0, p: 0 }, { x: 10, y: 0, p: 0 })).toBe(3)
  })

  it('mede a distância até a extremidade quando o ponto está fora do segmento', () => {
    expect(distanceToSegment({ x: 13, y: 4, p: 0 }, { x: 0, y: 0, p: 0 }, { x: 10, y: 0, p: 0 })).toBe(5)
  })

  it('funciona com segmento degenerado (um único ponto)', () => {
    expect(distanceToSegment({ x: 3, y: 4, p: 0 }, { x: 0, y: 0, p: 0 }, { x: 0, y: 0, p: 0 })).toBe(5)
  })
})

describe('strokeHitTest', () => {
  it('considera o raio da borracha e a espessura do traço', () => {
    const s = stroke('a', [[0, 0], [100, 0]], 4)
    expect(strokeHitTest(s, { x: 50, y: 11, p: 0 }, 10)).toBe(true)
    expect(strokeHitTest(s, { x: 50, y: 13, p: 0 }, 10)).toBe(false)
  })

  it('detecta traços de um único ponto', () => {
    expect(strokeHitTest(stroke('a', [[10, 10]]), { x: 12, y: 10, p: 0 }, 1)).toBe(true)
  })

  it('ignora traços vazios', () => {
    expect(strokeHitTest(stroke('a', []), { x: 0, y: 0, p: 0 }, 100)).toBe(false)
  })
})

describe('eraseAt', () => {
  it('remove apenas os traços atingidos', () => {
    const strokes = [stroke('a', [[0, 0], [100, 0]]), stroke('b', [[0, 200], [100, 200]])]
    expect(eraseAt(strokes, { x: 50, y: 0, p: 0 }, 5).map((s) => s.id)).toEqual(['b'])
  })

  it('devolve a mesma referência quando nada é apagado', () => {
    const strokes = [stroke('a', [[0, 0], [100, 0]])]
    expect(eraseAt(strokes, { x: 50, y: 300, p: 0 }, 5)).toBe(strokes)
  })
})

describe('normalizePressure', () => {
  it('usa pressão neutra para mouse e toque', () => {
    expect(normalizePressure(0, 'mouse')).toBe(0.5)
    expect(normalizePressure(1, 'touch')).toBe(0.5)
  })

  it('usa a pressão real da caneta, limitada a 1', () => {
    expect(normalizePressure(0.8, 'pen')).toBe(0.8)
    expect(normalizePressure(1.4, 'pen')).toBe(1)
    expect(normalizePressure(0, 'pen')).toBe(0.5)
  })
})
