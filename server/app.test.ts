import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createRequestHandler, parseSummarizeInput, type AppOptions } from './app.ts'

let server: Server | null = null
let staticDir = ''

beforeAll(async () => {
  staticDir = await mkdtemp(path.join(tmpdir(), 'notas-static-'))
  await mkdir(path.join(staticDir, 'assets'))
  await writeFile(path.join(staticDir, 'index.html'), '<h1>Notas</h1>')
  await writeFile(path.join(staticDir, 'assets', 'app.js'), 'console.log(1)')
  await writeFile(path.join(path.dirname(staticDir), 'segredo.txt'), 'não pode vazar')
})

afterAll(async () => {
  await rm(staticDir, { recursive: true, force: true })
  await rm(path.join(path.dirname(staticDir), 'segredo.txt'), { force: true })
})

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = null
})

async function start(options: Partial<AppOptions> = {}): Promise<string> {
  server = createServer(createRequestHandler({ summarizer: null, logError: () => {}, ...options }))
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
}

const post = (base: string, body: unknown) =>
  fetch(`${base}/api/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('parseSummarizeInput', () => {
  it('limpa e valida os campos', () => {
    expect(parseSummarizeInput({ transcript: '  aula  ', title: '  Física ' })).toEqual({
      transcript: 'aula',
      title: 'Física',
    })
    expect(parseSummarizeInput({ transcript: 'aula', title: '   ' })).toEqual({ transcript: 'aula', title: undefined })
  })

  it('rejeita transcrição vazia ou de tipo errado', () => {
    expect(() => parseSummarizeInput({ transcript: '   ' })).toThrow('vazia')
    expect(() => parseSummarizeInput({ transcript: 42 })).toThrow('vazia')
    expect(() => parseSummarizeInput(null)).toThrow('inválido')
    expect(() => parseSummarizeInput({ transcript: 'ok', title: 1 })).toThrow('Título')
  })
})

describe('API', () => {
  it('informa se a IA está configurada', async () => {
    const base = await start()
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ ok: true, aiConfigured: false })
  })

  it('responde 503 quando não há chave configurada', async () => {
    const base = await start()
    const response = await post(base, { transcript: 'aula' })
    expect(response.status).toBe(503)
  })

  it('transmite o resumo em streaming', async () => {
    const base = await start({
      summarizer: async (input, onText) => {
        onText('## Resumo')
        onText(` de ${input.title}`)
        return { stopReason: 'end_turn' }
      },
    })
    const response = await post(base, { transcript: 'conteúdo', title: 'Física' })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('## Resumo de Física')
  })

  it('avisa quando o resumo é cortado pelo limite de tokens', async () => {
    const base = await start({
      summarizer: async (_input, onText) => {
        onText('texto')
        return { stopReason: 'max_tokens' }
      },
    })
    expect(await (await post(base, { transcript: 'x' })).text()).toContain('cortado')
  })

  it('devolve erro JSON quando o modelo recusa sem gerar texto', async () => {
    const base = await start({ summarizer: async () => ({ stopReason: 'refusal' }) })
    const response = await post(base, { transcript: 'x' })
    expect(response.status).toBe(502)
    expect(((await response.json()) as { error: string }).error).toContain('não pôde')
  })

  it('devolve erro JSON quando o modelo falha antes de responder', async () => {
    const base = await start({
      summarizer: async () => {
        throw new Error('falha de rede')
      },
    })
    const response = await post(base, { transcript: 'x' })
    expect(response.status).toBe(502)
  })

  it('valida o corpo da requisição', async () => {
    const base = await start({ summarizer: async () => ({ stopReason: 'end_turn' }) })
    expect((await post(base, '{quebrado')).status).toBe(400)
    expect((await post(base, { transcript: '' })).status).toBe(400)
    expect((await fetch(`${base}/api/summarize`)).status).toBe(405)
    expect((await fetch(`${base}/api/outra`)).status).toBe(404)
  })

  it('rejeita corpos grandes demais', async () => {
    const base = await start({ summarizer: async () => ({ stopReason: 'end_turn' }) })
    const response = await post(base, { transcript: 'a'.repeat(3 * 1024 * 1024) })
    expect(response.status).toBe(413)
  })
})

describe('arquivos estáticos', () => {
  it('serve o index.html e os assets', async () => {
    const base = await start({ staticDir })
    expect(await (await fetch(`${base}/`)).text()).toBe('<h1>Notas</h1>')
    expect(await (await fetch(`${base}/caderno/123`)).text()).toBe('<h1>Notas</h1>')
    const asset = await fetch(`${base}/assets/app.js`)
    expect(asset.headers.get('content-type')).toContain('javascript')
    expect((await fetch(`${base}/assets/nao-existe.js`)).status).toBe(404)
  })

  it('bloqueia acesso fora da pasta pública', async () => {
    const base = await start({ staticDir })
    const response = await fetch(`${base}/..%2Fsegredo.txt`)
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('não pode vazar')
  })
})
