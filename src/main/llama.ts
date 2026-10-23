import { spawn, ChildProcess, execSync } from 'child_process'
import { existsSync, statSync, readdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { LocalServerStatus } from '../shared/types'
import { modelsDir } from './store'

let proc: ChildProcess | null = null
let status: LocalServerStatus = { state: 'stopped' }
let listeners: ((s: LocalServerStatus) => void)[] = []

export function onStatus(fn: (s: LocalServerStatus) => void) { listeners.push(fn) }
function set(s: Partial<LocalServerStatus>) { status = { ...status, ...s }; listeners.forEach((l) => l(status)) }
export function getStatus() { return status }

/** Find a llama-server binary: bundled (resources/bin), PATH, or Homebrew. */
export function findLlamaServer(): string | null {
  const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
  const bundled = app.isPackaged ? join(process.resourcesPath, 'bin', exe) : join(app.getAppPath(), 'resources', 'bin', exe)
  if (existsSync(bundled)) return bundled
  const candidates = process.platform === 'win32'
    ? ['llama-server.exe']
    : ['/opt/homebrew/bin/llama-server', '/usr/local/bin/llama-server', '/usr/bin/llama-server']
  for (const c of candidates) if (existsSync(c)) return c
  try {
    const found = execSync(process.platform === 'win32' ? 'where llama-server' : 'which llama-server', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n')[0]
    if (found) return found
  } catch { /* not found */ }
  return null
}

export function listModels(): { name: string; path: string; sizeGb: number }[] {
  if (!existsSync(modelsDir)) return []
  return readdirSync(modelsDir).filter((f) => f.endsWith('.gguf')).map((f) => {
    const p = join(modelsDir, f)
    return { name: f, path: p, sizeGb: Math.round((statSync(p).size / 1e9) * 10) / 10 }
  })
}

async function waitHealthy(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (proc?.exitCode != null) return false
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`)
      if (r.ok) { const j = (await r.json().catch(() => ({}))) as { status?: string }; if (!j.status || j.status === 'ok') return true }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 700))
  }
  return false
}

export async function startServer(opts: { modelPath: string; port: number; contextSize: number; gpuLayers: number; reasoningBudget: number }): Promise<LocalServerStatus> {
  if (proc && status.state === 'running' && status.modelPath === opts.modelPath) return status
  await stopServer()
  const bin = findLlamaServer()
  if (!bin) { set({ state: 'error', message: 'llama-server not found. Install llama.cpp (brew install llama.cpp) or place it in resources/bin.' }); return status }
  if (!existsSync(opts.modelPath)) { set({ state: 'error', message: `Model not found: ${opts.modelPath}` }); return status }

  const attempt = (ngl: number) => new Promise<boolean>((resolve) => {
    const args = ['-m', opts.modelPath, '--port', String(opts.port), '--host', '127.0.0.1', '-c', String(opts.contextSize), '-ngl', String(ngl),
      '--jinja', '--temp', '1.0', '--top-p', '0.95', '--top-k', '20', '--flash-attn', 'on', '--no-warmup', '-np', '1', '--reasoning-budget', String(opts.reasoningBudget)]
    set({ state: 'starting', port: opts.port, modelPath: opts.modelPath, message: `Loading model (gpu layers ${ngl})...` })
    proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    proc.stderr?.on('data', (d) => { tail = (tail + d.toString()).slice(-4000) })
    proc.stdout?.on('data', (d) => { tail = (tail + d.toString()).slice(-4000) })
    proc.on('exit', (code) => { if (status.state === 'running') set({ state: 'stopped', message: `llama-server exited (${code})` }) })
    waitHealthy(opts.port, 180_000).then((ok) => {
      if (ok) { set({ state: 'running', pid: proc?.pid, message: 'Ready' }); resolve(true) }
      else { const t = tail; try { proc?.kill() } catch { /* ignore */ } proc = null; set({ state: 'error', message: t.split('\n').filter(Boolean).slice(-3).join(' | ') }); resolve(false) }
    })
  })

  // Apple Silicon with limited unified memory: fall back to partial offload if full offload fails.
  if (await attempt(opts.gpuLayers)) return status
  if (opts.gpuLayers > 24 && (await attempt(24))) return status
  if (opts.gpuLayers > 0 && (await attempt(0))) return status
  return status
}

export async function stopServer(): Promise<void> {
  if (!proc) { set({ state: 'stopped' }); return }
  const p = proc; proc = null
  await new Promise<void>((resolve) => { p.once('exit', () => resolve()); try { p.kill('SIGTERM') } catch { resolve() } setTimeout(() => { try { p.kill('SIGKILL') } catch { /* ignore */ } resolve() }, 3000) })
  set({ state: 'stopped', pid: undefined })
}

app.on('before-quit', () => { try { proc?.kill() } catch { /* ignore */ } })
