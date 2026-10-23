import { promises as fs } from 'fs'
import { join, resolve, relative, dirname } from 'path'
import { randomUUID } from 'crypto'
import type { AgentEvent, ModelTarget } from '../shared/types'
import { runCommand, startBackground, isDenied, listProcs } from './procs'
import { readTree } from './fs'
import { deploy as vercelDeploy } from './vercel'
import { loadSettings } from './store'

type Msg = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string; reasoning_content?: string }
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

const TOOLS = [
  { type: 'function', function: { name: 'list_files', description: 'List files and folders in the project (relative paths). Call with no args for the whole tree (depth 3).', parameters: { type: 'object', properties: { path: { type: 'string', description: 'subfolder, default "."' } } } } },
  { type: 'function', function: { name: 'read_file', description: 'Read a text file in the project.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Create or overwrite a file with the full content. Creates parent folders.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'run_command', description: 'Run a shell command in the project root and return its output. Use background=true for long-running servers (npm run dev); it returns the detected localhost URL.', parameters: { type: 'object', properties: { command: { type: 'string' }, background: { type: 'boolean' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'deploy', description: 'Deploy the project to Vercel (production) and return the live URL. Only call when the user asked to deploy/publish and the app runs locally without errors.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'finish', description: 'Call when the task is complete. Summarize what was built and how to run it.', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } } },
]

const SYSTEM = (root: string, lang: 'ko' | 'en') => `You are Switch Coder, an autonomous vibe-coding agent working inside the project folder "${root}". The user describes what they want; you build it by calling tools. Reply to the user in ${lang === 'ko' ? 'Korean' : 'English'}.

Rules:
- Work in small, concrete steps. First call list_files to see what exists. Then write files one at a time, then run them.
- Prefer simple, proven stacks (Vite + React + TypeScript for web UIs, plain Node/Python scripts for tools). Use npm.
- After writing code, actually run it (run_command). For dev servers use background=true and report the URL. Read errors and fix them; do not give up after one failure, but stop after 4 failed attempts on the same error and explain.
- Never run destructive commands. Never leave the project folder.
- Keep your visible messages short. Put thinking in reasoning, not in the message.
- If .env.local exists, read it to learn which services are connected (SUPABASE_* → use @supabase/supabase-js; DATABASE_URL/POSTGRES_URL → use Prisma or Drizzle). Never print secret values back to the user.
- Only call deploy when the user asked to deploy or publish, after the app runs locally.
- When everything runs, call finish with a 2-5 line summary.`

const running = new Map<string, AbortController>()
export function cancelAgent(runId: string) { running.get(runId)?.abort() }

function safePath(root: string, p: string): string {
  const abs = resolve(root, p || '.')
  if (abs !== root && !abs.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) throw new Error(`Path escapes project: ${p}`)
  return abs
}
const clip = (s: string, n = 6000) => (s.length > n ? s.slice(0, n / 2) + `\n…[${s.length - n} chars omitted]…\n` + s.slice(-n / 2) : s)

async function execTool(root: string, name: string, args: Record<string, unknown>, emitLog: (s: string) => void): Promise<{ ok: boolean; output: string; finished?: string }> {
  try {
    switch (name) {
      case 'list_files': {
        const tree = await readTree(safePath(root, String(args.path ?? '.')), 3)
        const lines: string[] = []
        const walk = (n: typeof tree, d: number) => { for (const c of n.children ?? []) { lines.push('  '.repeat(d) + (c.isDir ? c.name + '/' : c.name)); if (c.isDir) walk(c, d + 1) } }
        walk(tree, 0)
        return { ok: true, output: lines.length ? clip(lines.join('\n'), 4000) : '(empty folder)' }
      }
      case 'read_file': { const t = await fs.readFile(safePath(root, String(args.path)), 'utf8'); return { ok: true, output: clip(t, 12000) } }
      case 'write_file': {
        const abs = safePath(root, String(args.path)); await fs.mkdir(dirname(abs), { recursive: true })
        await fs.writeFile(abs, String(args.content ?? ''), 'utf8')
        return { ok: true, output: `wrote ${relative(root, abs)} (${String(args.content ?? '').length} chars)` }
      }
      case 'run_command': {
        const cmd = String(args.command ?? '').trim(); const denied = isDenied(cmd); if (denied) return { ok: false, output: denied }
        emitLog(`$ ${cmd}\n`)
        if (args.background) {
          const info = await startBackground(cmd, root)
          return { ok: info.running, output: info.running ? `started in background (pid ${info.pid})${info.url ? `, url: ${info.url}` : ', no URL detected yet'}` : 'process exited immediately; check the terminal output' }
        }
        const r = await runCommand(cmd, root, 180_000, emitLog)
        return { ok: r.code === 0, output: clip(`${r.output}\n[exit ${r.code}${r.timedOut ? ', timed out' : ''}]`) }
      }
      case 'deploy': {
        emitLog('$ vercel deploy --prod\n')
        const r = await vercelDeploy(root, true, loadSettings().vercelToken || undefined, emitLog)
        return { ok: r.ok, output: r.ok ? `deployed: ${r.url ?? '(url not parsed)'}` : clip(`deploy failed:\n${r.output}`) }
      }
      case 'finish': return { ok: true, output: 'done', finished: String(args.summary ?? '') }
      default: return { ok: false, output: `unknown tool ${name}` }
    }
  } catch (e) { return { ok: false, output: e instanceof Error ? e.message : String(e) } }
}

function trim(messages: Msg[], budgetChars: number) {
  const size = () => messages.reduce((n, m) => n + (m.content?.length ?? 0) + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0), 0)
  while (size() > budgetChars && messages.length > 4) {
    // drop the oldest assistant/tool exchange after system + first user
    const idx = messages.findIndex((m, i) => i >= 2 && (m.role === 'assistant' || m.role === 'tool'))
    if (idx < 0) break
    messages.splice(idx, 1)
  }
}

export async function runAgent(opts: { root: string; task: string; target: ModelTarget; apiKey?: string; lang: 'ko' | 'en'; history: Msg[]; maxIterations?: number; contextChars?: number; signal?: AbortSignal; context?: string; allowDeploy?: boolean }, emit: (e: AgentEvent) => void): Promise<Msg[]> {
  const runId = randomUUID()
  const ac = new AbortController(); running.set(runId, ac)
  opts.signal?.addEventListener('abort', () => ac.abort(), { once: true })
  const sys = SYSTEM(opts.root, opts.lang) + (opts.context ? `\n\nProject context (from the approved plan):\n${opts.context}` : '')
  const messages: Msg[] = opts.history.length ? [...opts.history] : [{ role: 'system', content: sys }]
  messages.push({ role: 'user', content: opts.task })
  const base = (opts.target.baseUrl ?? '').replace(/\/$/, '')
  const log = (s: string) => emit({ runId, type: 'status', text: s })
  let iterations = 0
  try {
    emit({ runId, type: 'status', text: 'start' })
    for (; iterations < (opts.maxIterations ?? 30); iterations++) {
      if (ac.signal.aborted) throw new Error('cancelled')
      trim(messages, opts.contextChars ?? 40_000)
      const r = await fetch(`${base}/chat/completions`, { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
        body: JSON.stringify({ model: opts.target.model, messages, tools: opts.allowDeploy === false ? TOOLS.filter((t) => t.function.name !== 'deploy') : TOOLS, tool_choice: 'auto', max_tokens: 6144, temperature: 1.0, stream: false }) })
      if (!r.ok) throw new Error(`${opts.target.label}: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 300)}`)
      const j = (await r.json()) as { choices: { message: Msg & { reasoning_content?: string }; finish_reason: string }[] }
      const m = j.choices[0].message
      if (m.reasoning_content) emit({ runId, type: 'reasoning', text: m.reasoning_content })
      const assistant: Msg = { role: 'assistant', content: m.content ?? '', tool_calls: m.tool_calls }
      messages.push(assistant)
      if (m.content?.trim()) emit({ runId, type: 'assistant', text: m.content })
      if (!m.tool_calls?.length) {
        // Model answered without tools: treat as done (conversational reply)
        emit({ runId, type: 'done', summary: m.content ?? '', iterations }); break
      }
      let finished: string | null = null
      for (const tc of m.tool_calls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch { args = { _raw: tc.function.arguments } }
        emit({ runId, type: 'tool_call', callId: tc.id, name: tc.function.name, args: tc.function.name === 'write_file' ? { path: args.path, content: String(args.content ?? '').slice(0, 400) + (String(args.content ?? '').length > 400 ? '…' : '') } : args })
        const res = await execTool(opts.root, tc.function.name, args, (s) => emit({ runId, type: 'status', text: s }))
        emit({ runId, type: 'tool_result', callId: tc.id, name: tc.function.name, ok: res.ok, output: clip(res.output, 2000) })
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: res.output })
        if (res.finished != null) finished = res.finished
      }
      if (finished != null) { emit({ runId, type: 'done', summary: finished, iterations }); break }
    }
    if (iterations >= (opts.maxIterations ?? 30)) emit({ runId, type: 'done', summary: 'Stopped: iteration limit reached. Say "continue" to keep going.', iterations })
  } catch (e) {
    emit({ runId, type: 'error', message: ac.signal.aborted ? 'cancelled' : e instanceof Error ? e.message : String(e) })
  } finally { running.delete(runId); void log; void listProcs; void join }
  return messages
}
export type { Msg as AgentMsg }

/** One constrained model call that must answer via a single tool (grammar-constrained in llama.cpp). */
export async function structuredCall<T>(opts: { target: ModelTarget; apiKey?: string; system: string; user: string; tool: { name: string; description: string; parameters: Record<string, unknown> }; signal?: AbortSignal; maxTokens?: number }): Promise<{ data: T; reasoning?: string }> {
  const base = (opts.target.baseUrl ?? '').replace(/\/$/, '')
  const body = (force: boolean) => JSON.stringify({ model: opts.target.model, stream: false, max_tokens: opts.maxTokens ?? 4096, temperature: 0.7,
    messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user + (force ? `\n\nYou MUST call the ${opts.tool.name} tool now with valid JSON arguments. Do not answer in prose.` : '') }],
    tools: [{ type: 'function', function: opts.tool }], tool_choice: force ? 'required' : 'auto' })
  let reasoning: string | undefined
  for (const force of [false, true]) {
    const r = await fetch(`${base}/chat/completions`, { method: 'POST', signal: opts.signal, headers: { 'content-type': 'application/json', ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) }, body: body(force) })
    if (!r.ok) throw new Error(`${opts.target.label}: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 300)}`)
    const j = (await r.json()) as { choices: { message: { content?: string; reasoning_content?: string; tool_calls?: ToolCall[] } }[] }
    const m = j.choices[0]?.message ?? {}
    reasoning = m.reasoning_content ?? reasoning
    const tc = m.tool_calls?.find((t) => t.function.name === opts.tool.name) ?? m.tool_calls?.[0]
    const raw = tc?.function.arguments ?? m.content?.match(/\{[\s\S]*\}/)?.[0]
    if (raw) { try { return { data: JSON.parse(raw) as T, reasoning } } catch { /* retry forced */ } }
  }
  throw new Error(`Model did not return valid ${opts.tool.name} data`)
}
