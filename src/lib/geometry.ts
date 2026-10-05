import type { Point, Stroke } from './types'

/** Tamanho lógico da página (proporção A4). Os traços são guardados nesse sistema de coordenadas. */
export const PAGE_WIDTH = 1000
export const PAGE_HEIGHT = Math.round(PAGE_WIDTH * Math.SQRT2)

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Indica se o ponto está a até `radius` (mais metade da espessura) de algum segmento do traço. */
export function strokeHitTest(stroke: Stroke, point: Point, radius: number): boolean {
  const { points } = stroke
  if (points.length === 0) return false
  const threshold = radius + stroke.width / 2
  if (points.length === 1) return distanceToSegment(point, points[0], points[0]) <= threshold
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(point, points[i - 1], points[i]) <= threshold) return true
  }
  return false
}

/** Remove os traços atingidos pela borracha. Devolve o mesmo array se nada mudou. */
export function eraseAt(strokes: Stroke[], point: Point, radius: number): Stroke[] {
  const remaining = strokes.filter((stroke) => !strokeHitTest(stroke, point, radius))
  return remaining.length === strokes.length ? strokes : remaining
}

/** Pressão efetiva: dispositivos sem sensor (mouse) reportam 0 ou 0.5; usamos 0.5 como neutro. */
export function normalizePressure(pressure: number, pointerType: string): number {
  if (pointerType !== 'pen' || !Number.isFinite(pressure) || pressure <= 0) return 0.5
  return Math.min(1, pressure)
}

/** Largura do traço da caneta em função da pressão (entre 50% e 150% da base). */
export function pressureWidth(baseWidth: number, pressure: number): number {
  return baseWidth * (0.5 + pressure)
}
