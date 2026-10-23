import type { ChatRequest, ChatChunk } from '../shared/types'

type Emit = (c: ChatChunk) => void
const inflight = new Map<string, AbortController>()

export function cancel(requestId: string) { inflight.get(requestId)?.abort(); inflight.delete(requestId) }

export async function streamChat(req: ChatRequest, emit: Emit, opts: { apiKey?: string; networkAllowed: boolean }) {
  const ac = new AbortController(); inflight.set(req.requestId, ac)
  try {
    if (req.target.kind !== 'local' && !opts.networkAllowed) throw new Error('Privacy lock is on: cloud requests are blocked.')
    if (req.target.kind === 'anthropic') await anthropic(req, emit, ac.signal, opts.apiKey ?? '')
    else await openaiCompatible(req, emit, ac.signal, opts.apiKey ?? '')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    emit({ requestId: req.requestId, error: ac.signal.aborted ? 'cancelled' : msg, done: true })
  } finally { inflight.delete(req.requestId) }
}

async function openaiCompatible(req: ChatRequest, emit: Emit, signal: AbortSignal, apiKey: string) {
  const base = (req.target.baseUrl ?? '').replace(/\/$/, '')
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model: req.target.model, messages: req.messages, stream: true, max_tokens: req.maxTokens ?? 4096, temperature: req.temperature ?? 1.0, stream_options: { include_usage: true } }),
  })
  if (!r.ok || !r.body) throw new Error(`${req.target.label}: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 300)}`)
  let usage: { input: number; output: number } | undefined
  for await (const data of sse(r.body, signal)) {
    if (data === '[DONE]') break
    let j: { choices?: { delta?: { content?: string; reasoning_content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
    try { j = JSON.parse(data) } catch { continue }
    const d = j.choices?.[0]?.delta
    if (d?.reasoning_content) emit({ requestId: req.requestId, reasoning: d.reasoning_content })
    if (d?.content) emit({ requestId: req.requestId, delta: d.content })
    if (j.usage) usage = { input: j.usage.prompt_tokens ?? 0, output: j.usage.completion_tokens ?? 0 }
  }
  emit({ requestId: req.requestId, done: true, usage })
}

async function anthropic(req: ChatRequest, emit: Emit, signal: AbortSignal, apiKey: string) {
  if (!apiKey) throw new Error('Anthropic API key missing (Settings → Cloud).')
  const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const messages = req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: req.target.model, max_tokens: req.maxTokens ?? 4096, system: system || undefined, messages, stream: true }),
  })
  if (!r.ok || !r.body) throw new Error(`Anthropic: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 300)}`)
  const usage = { input: 0, output: 0 }
  for await (const data of sse(r.body, signal)) {
    let j: { type?: string; delta?: { type?: string; text?: string }; message?: { usage?: { input_tokens?: number } }; usage?: { output_tokens?: number } }
    try { j = JSON.parse(data) } catch { continue }
    if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && j.delta.text) emit({ requestId: req.requestId, delta: j.delta.text })
    if (j.type === 'message_start') usage.input = j.message?.usage?.input_tokens ?? 0
    if (j.type === 'message_delta') usage.output = j.usage?.output_tokens ?? usage.output
  }
  emit({ requestId: req.requestId, done: true, usage })
}

async function* sse(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader(); const dec = new TextDecoder(); let buf = ''
  while (!signal.aborted) {
    const { value, done } = await reader.read(); if (done) break
    buf += dec.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1)
      if (line.startsWith('data:')) yield line.slice(5).trim()
    }
  }
}
