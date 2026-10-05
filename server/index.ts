import Anthropic from '@anthropic-ai/sdk'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequestHandler, type Summarizer } from './app.ts'
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.ts'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(rootDir, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const PORT = Number(process.env.PORT ?? 8787)
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'

function createClaudeSummarizer(): Summarizer | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const client = new Anthropic()

  return async (input, onText, signal) => {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        // Se o modelo recusar, a API refaz o pedido em um modelo alternativo automaticamente.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(input.transcript, input.title) }],
      },
      { signal },
    )
    stream.on('text', (delta) => onText(delta))
    const message = await stream.finalMessage()
    return { stopReason: message.stop_reason }
  }
}

const summarizer = createClaudeSummarizer()
const staticDir = path.join(rootDir, 'dist')

const server = createServer(
  createRequestHandler({
    summarizer,
    staticDir: existsSync(staticDir) ? staticDir : undefined,
  }),
)

server.listen(PORT, () => {
  console.log(`Servidor do Notas em http://localhost:${PORT}`)
  if (!summarizer) console.warn('ANTHROPIC_API_KEY não definida: os resumos com IA ficam desativados.')
  else console.log(`Resumos com o modelo ${MODEL}.`)
})
