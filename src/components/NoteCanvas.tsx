import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { PAGE_HEIGHT, PAGE_WIDTH, eraseAt, normalizePressure } from '../lib/geometry'
import { drawPaper, drawStroke, setupCanvas } from '../lib/render'
import { createId } from '../lib/format'
import type { Point, Stroke, Tool } from '../lib/types'

export interface PenSettings {
  tool: Tool
  color: string
  width: number
}

interface NoteCanvasProps {
  strokes: Stroke[]
  settings: PenSettings
  onCommit: (strokes: Stroke[]) => void
}

const ERASER_RADIUS = 12
const MAX_CANVAS_WIDTH = 900

export function NoteCanvas({ strokes, settings, onCommit }: NoteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLCanvasElement>(null)
  const [cssWidth, setCssWidth] = useState(0)
  const [penDetected, setPenDetected] = useState(false)

  const activePointerRef = useRef<number | null>(null)
  const currentStrokeRef = useRef<Stroke | null>(null)
  // Durante o uso da borracha, os traços apagados ficam aqui até o ponteiro ser solto.
  const erasingRef = useRef<Stroke[] | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => setCssWidth(Math.min(MAX_CANVAS_WIDTH, Math.floor(container.clientWidth)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const renderBase = useCallback(
    (list: Stroke[]) => {
      const canvas = baseRef.current
      if (!canvas || cssWidth === 0) return
      const ctx = setupCanvas(canvas, cssWidth)
      if (!ctx) return
      drawPaper(ctx)
      for (const stroke of list) drawStroke(ctx, stroke)
    },
    [cssWidth],
  )

  const clearLive = useCallback(() => {
    const canvas = liveRef.current
    if (!canvas || cssWidth === 0) return
    const ctx = setupCanvas(canvas, cssWidth)
    ctx?.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
    return ctx
  }, [cssWidth])

  useEffect(() => {
    renderBase(erasingRef.current ?? strokes)
    clearLive()
  }, [strokes, renderBase, clearLive])

  const toPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    const scale = PAGE_WIDTH / rect.width
    return {
      x: (event.clientX - rect.left) * scale,
      y: (event.clientY - rect.top) * scale,
      p: normalizePressure(event.pressure, event.pointerType),
    }
  }

  const shouldIgnore = (event: ReactPointerEvent<HTMLCanvasElement>) =>
    // Rejeição de palma: depois que uma caneta é detectada, o toque com o dedo só rola a página.
    !event.isPrimary || (penDetected && event.pointerType === 'touch') || (event.pointerType === 'mouse' && event.button !== 0)

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'pen' && !penDetected) setPenDetected(true)
    if (shouldIgnore(event) || activePointerRef.current !== null) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointerRef.current = event.pointerId
    const point = toPoint(event)

    if (settings.tool === 'eraser') {
      erasingRef.current = eraseAt(strokes, point, ERASER_RADIUS)
      renderBase(erasingRef.current)
      return
    }
    currentStrokeRef.current = {
      id: createId(),
      tool: settings.tool,
      color: settings.color,
      width: settings.tool === 'highlighter' ? settings.width * 4 : settings.width,
      points: [point],
    }
    const ctx = clearLive()
    if (ctx) drawStroke(ctx, currentStrokeRef.current)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    event.preventDefault()
    // Eventos agrupados dão traços mais suaves em canetas de alta frequência.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? []
    const rect = event.currentTarget.getBoundingClientRect()
    const scale = PAGE_WIDTH / rect.width
    const points: Point[] =
      events.length > 0
        ? events.map((e) => ({
            x: (e.clientX - rect.left) * scale,
            y: (e.clientY - rect.top) * scale,
            p: normalizePressure(e.pressure, e.pointerType),
          }))
        : [toPoint(event)]

    if (erasingRef.current) {
      let next = erasingRef.current
      for (const point of points) next = eraseAt(next, point, ERASER_RADIUS)
      if (next !== erasingRef.current) {
        erasingRef.current = next
        renderBase(next)
      }
      return
    }
    const stroke = currentStrokeRef.current
    if (!stroke) return
    stroke.points.push(...points)
    const ctx = clearLive()
    if (ctx) drawStroke(ctx, stroke)
  }

  const finish = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    activePointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const erased = erasingRef.current
    erasingRef.current = null
    if (erased) {
      if (erased !== strokes) onCommit(erased)
      return
    }
    const stroke = currentStrokeRef.current
    currentStrokeRef.current = null
    if (stroke) onCommit([...strokes, stroke])
  }

  return (
    <div ref={containerRef} className="canvas-container">
      <div className="canvas-stack" style={{ width: cssWidth || undefined }}>
        <canvas ref={baseRef} className="canvas-base" aria-hidden="true" />
        <canvas
          ref={liveRef}
          className="canvas-live"
          aria-label="Página do caderno"
          role="img"
          style={{ touchAction: penDetected ? 'pan-x pan-y pinch-zoom' : 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>
    </div>
  )
}
