import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

export const MAX_BODY_BYTES = 2 * 1024 * 1024
export const MAX_TRANSCRIPT_CHARS = 400_000
const MAX_TITLE_CHARS = 200

export interface SummarizeInput {
  transcript: string
  title?: string
}

export interface SummarizeOutcome {
  stopReason: string | null
}

/** Gera o resumo chamando `onText` a cada pedaço de texto recebido do modelo. */
export type Summarizer = (
  input: SummarizeInput,
  onText: (delta: string) => void,
  signal: AbortSignal,
) => Promise<SummarizeOutcome>

export interface AppOptions {
  summarizer: Summarizer | null
  /** Pasta com o build do front-end (`dist`), servida em produção. */
  staticDir?: string
  logError?: (message: string, cause: unknown) => void
}

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'A transcrição é grande demais para ser enviada.')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Corpo da requisição inválido.')
  }
}

export function parseSummarizeInput(body: unknown): SummarizeInput {
  if (typeof body !== 'object' || body === null) throw new HttpError(400, 'Corpo da requisição inválido.')
  const { transcript, title } = body as Record<string, unknown>
  if (typeof transcript !== 'string' || transcript.trim().length === 0) {
    throw new HttpError(400, 'A transcrição está vazia.')
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    throw new HttpError(413, 'A transcrição é grande demais. Divida a aula em partes menores.')
  }
  if (title !== undefined && typeof title !== 'string') throw new HttpError(400, 'Título inválido.')
  const cleanTitle = title?.trim().slice(0, MAX_TITLE_CHARS)
  return { transcript: transcript.trim(), title: cleanTitle || undefined }
}

async function handleSummarize(
  req: IncomingMessage,
  res: ServerResponse,
  summarizer: Summarizer,
  logError: NonNullable<AppOptions['logError']>,
): Promise<void> {
  const input = parseSummarizeInput(await readJsonBody(req))

  // Cancela a chamada ao modelo se o usuário fechar a página no meio do resumo.
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableFinished) controller.abort()
  })

  let started = false
  const write = (text: string) => {
    if (!started) {
      started = true
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
    }
    res.write(text)
  }

  try {
    const outcome = await summarizer(input, write, controller.signal)
    if (!started) {
      const message =
        outcome.stopReason === 'refusal'
          ? 'O modelo não pôde resumir este conteúdo.'
          : 'O resumo voltou vazio. Tente novamente.'
      sendJson(res, 502, { error: message })
      return
    }
    if (outcome.stopReason === 'max_tokens') write('\n\n> ⚠️ O resumo foi cortado por ser muito longo.')
    if (outcome.stopReason === 'refusal') write('\n\n> ⚠️ O modelo interrompeu o resumo.')
    res.end()
  } catch (cause) {
    if (controller.signal.aborted) return
    logError('Falha ao gerar resumo', cause)
    if (!started) {
      sendJson(res, 502, { error: 'Não foi possível gerar o resumo agora. Tente novamente em instantes.' })
    } else {
      res.end('\n\n> ⚠️ A geração do resumo foi interrompida por um erro. Tente novamente.')
    }
  }
}

async function serveStatic(res: ServerResponse, staticDir: string, urlPath: string): Promise<boolean> {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return false
  }
  const root = path.resolve(staticDir)
  const candidate = path.resolve(root, `.${path.posix.normalize(`/${decoded}`)}`)
  // Impede acesso a arquivos fora da pasta pública (path traversal).
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return false

  const tryFile = async (file: string) => {
    try {
      const info = await stat(file)
      return info.isFile() ? file : null
    } catch {
      return null
    }
  }
  // Rotas desconhecidas caem no index.html (aplicação de página única).
  const file = (await tryFile(candidate)) ?? (path.extname(decoded) ? null : await tryFile(path.join(root, 'index.html')))
  if (!file) return false

  const isAsset = file.startsWith(path.join(root, 'assets') + path.sep)
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  createReadStream(file).pipe(res)
  return true
}

export function createRequestHandler(options: AppOptions) {
  const logError = options.logError ?? ((message, cause) => console.error(message, cause))

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')

      if (url.pathname === '/api/health') {
        if (req.method !== 'GET') throw new HttpError(405, 'Método não permitido.')
        sendJson(res, 200, { ok: true, aiConfigured: options.summarizer !== null })
        return
      }

      if (url.pathname === '/api/summarize') {
        if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.')
        if (!options.summarizer) {
          throw new HttpError(503, 'Resumos desativados: configure ANTHROPIC_API_KEY no servidor.')
        }
        await handleSummarize(req, res, options.summarizer, logError)
        return
      }

      if (url.pathname.startsWith('/api/')) throw new HttpError(404, 'Rota não encontrada.')

      if (options.staticDir && (req.method === 'GET' || req.method === 'HEAD')) {
        if (await serveStatic(res, options.staticDir, url.pathname)) return
      }
      throw new HttpError(404, 'Não encontrado.')
    } catch (cause) {
      if (res.headersSent) {
        res.end()
        return
      }
      if (cause instanceof HttpError) {
        sendJson(res, cause.status, { error: cause.message })
      } else {
        logError('Erro inesperado no servidor', cause)
        sendJson(res, 500, { error: 'Erro interno do servidor.' })
      }
    }
  }
}
