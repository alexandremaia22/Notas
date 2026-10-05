import { PAGE_HEIGHT, PAGE_WIDTH, pressureWidth } from './geometry'
import type { Stroke } from './types'

const HIGHLIGHTER_ALPHA = 0.35
const LINE_SPACING = 40
const MARGIN_LEFT = 90

export function drawPaper(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#fffdf8'
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  ctx.lineWidth = 1
  ctx.strokeStyle = '#dbe4f0'
  ctx.beginPath()
  for (let y = LINE_SPACING * 2; y < PAGE_HEIGHT; y += LINE_SPACING) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(PAGE_WIDTH, y + 0.5)
  }
  ctx.stroke()
  ctx.strokeStyle = '#f2c4c4'
  ctx.beginPath()
  ctx.moveTo(MARGIN_LEFT + 0.5, 0)
  ctx.lineTo(MARGIN_LEFT + 0.5, PAGE_HEIGHT)
  ctx.stroke()
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const { points } = stroke
  if (points.length === 0) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color

  if (points.length === 1) {
    const [p] = points
    const width = stroke.tool === 'pen' ? pressureWidth(stroke.width, p.p) : stroke.width
    if (stroke.tool === 'highlighter') ctx.globalAlpha = HIGHLIGHTER_ALPHA
    ctx.beginPath()
    ctx.arc(p.x, p.y, width / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  if (stroke.tool === 'highlighter') {
    // Um único caminho evita que as sobreposições do próprio traço fiquem mais escuras.
    ctx.globalAlpha = HIGHLIGHTER_ALPHA
    ctx.lineWidth = stroke.width
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke()
    ctx.restore()
    return
  }

  // Caneta: segmentos suavizados por curvas quadráticas com espessura variável pela pressão.
  let prevMid = points[0]
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const mid = { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2, p: (prev.p + curr.p) / 2 }
    ctx.lineWidth = pressureWidth(stroke.width, prev.p)
    ctx.beginPath()
    ctx.moveTo(prevMid.x, prevMid.y)
    ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y)
    ctx.stroke()
    prevMid = mid
  }
  const last = points[points.length - 1]
  ctx.lineWidth = pressureWidth(stroke.width, last.p)
  ctx.beginPath()
  ctx.moveTo(prevMid.x, prevMid.y)
  ctx.lineTo(last.x, last.y)
  ctx.stroke()
  ctx.restore()
}

/** Prepara o canvas para desenhar em coordenadas lógicas da página, respeitando o devicePixelRatio. */
export function setupCanvas(canvas: HTMLCanvasElement, cssWidth: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1
  const cssHeight = cssWidth * (PAGE_HEIGHT / PAGE_WIDTH)
  const pixelWidth = Math.round(cssWidth * dpr)
  const pixelHeight = Math.round(cssHeight * dpr)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const scale = (cssWidth * dpr) / PAGE_WIDTH
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  return ctx
}
