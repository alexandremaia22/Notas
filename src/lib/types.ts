export type Tool = 'pen' | 'highlighter' | 'eraser'

export type StrokeTool = Exclude<Tool, 'eraser'>

export interface Point {
  x: number
  y: number
  /** Pressão normalizada entre 0 e 1. */
  p: number
}

export interface Stroke {
  id: string
  tool: StrokeTool
  color: string
  width: number
  points: Point[]
}

export interface Notebook {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface Page {
  id: string
  notebookId: string
  index: number
  strokes: Stroke[]
  updatedAt: number
}

export interface Recording {
  id: string
  notebookId: string
  title: string
  createdAt: number
  durationMs: number
  mimeType: string
  audio: Blob
  transcript: string
  summary: string | null
}
