export interface SummarizeRequest {
  transcript: string
  title?: string
}

export interface HealthResponse {
  ok: boolean
  aiConfigured: boolean
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal })
  if (!response.ok) throw new Error(`Servidor respondeu ${response.status}.`)
  return (await response.json()) as HealthResponse
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown }
    if (typeof data.error === 'string') return data.error
  } catch {
    // Corpo não era JSON; usa a mensagem genérica abaixo.
  }
  return `Falha ao gerar o resumo (erro ${response.status}).`
}

/**
 * Pede ao servidor um resumo da transcrição. O texto chega em streaming e
 * `onText` recebe o conteúdo acumulado a cada pedaço. Devolve o texto final.
 */
export async function summarizeTranscript(
  request: SummarizeRequest,
  onText: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))
  if (!response.body) throw new Error('O navegador não suportou a resposta em streaming.')

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let accumulated = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    accumulated += value
    onText(accumulated)
  }
  return accumulated
}
