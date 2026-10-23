import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import type { ProcInfo, ProcOutput } from '../shared/types'
import { toolchainEnv } from './toolchain'

const URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^\s"'`)]*)/
const DENY = [/\brm\s+-rf\s+\/(\s|$)/, /\bsudo\b/, /\bmkfs\b/, /\bdd\s+if=/, /:\(\)\s*\{/, />\s*\/dev\/sd/, /\bshutdown\b|\breboot\b/, /\bchmod\s+-R\s+777\s+\//]
export function isDenied(cmd: string): string | null { for (const r of DENY) if (r.test(cmd)) return `Blocked dangerous command: ${cmd}`; return null }

const shell = process.platform === 'win32' ? { cmd: 'cmd.exe', args: (c: string) => ['/d', '/s', '/c', c] } : { cmd: '/bin/zsh', args: (c: string) => ['-c', c] }
const env = () => ({ ...process.env, ...toolchainEnv(), CI: '1', FORCE_COLOR: '0', NO_COLOR: '1', BROWSER: 'none' })

/** Foreground command: waits (with timeout), returns combined output. */
export function runCommand(command: string, cwd: string, timeoutMs = 180_000, onChunk?: (s: string) => void): Promise<{ code: number | null; output: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const p = spawn(shell.cmd, shell.args(command), { cwd, env: env(), stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; let timedOut = false
    const push = (d: Buffer) => { const s = d.toString(); out += s; onChunk?.(s) }
    p.stdout.on('data', push); p.stderr.on('data', push)
    const t = setTimeout(() => { timedOut = true; try { p.kill('SIGKILL') } catch { /* ignore */ } }, timeoutMs)
    p.on('close', (code) => { clearTimeout(t); resolve({ code, output: out, timedOut }) })
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, output: out + '\n' + e.message, timedOut }) })
  })
}

/** Background processes (dev servers). Output is streamed to the renderer; first localhost URL is detected. */
const procs = new Map<string, { info: ProcInfo; child: ChildProcess; log: string }>()
let emit: ((o: ProcOutput) => void) | null = null
export function onProcOutput(fn: (o: ProcOutput) => void) { emit = fn }

export function startBackground(command: string, cwd: string): Promise<ProcInfo> {
  // one dev server per command string: restart if already running
  for (const [id, p] of procs) if (p.info.command === command && p.info.cwd === cwd) stopProcess(id)
  const id = randomUUID().slice(0, 8)
  const child = spawn(shell.cmd, shell.args(command), { cwd, env: env(), stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
  const info: ProcInfo = { id, command, pid: child.pid, cwd, running: true }
  const rec = { info, child, log: '' }
  procs.set(id, rec)
  return new Promise((resolve) => {
    let resolved = false
    const finish = () => { if (!resolved) { resolved = true; resolve(info) } }
    const onData = (d: Buffer) => {
      const s = d.toString(); rec.log = (rec.log + s).slice(-20000)
      let url: string | undefined
      if (!info.url) { const m = s.match(URL_RE); if (m) { info.url = m[1].replace('0.0.0.0', 'localhost'); url = info.url; finish() } }
      emit?.({ id, chunk: s, url })
    }
    child.stdout?.on('data', onData); child.stderr?.on('data', onData)
    child.on('exit', (code) => { info.running = false; emit?.({ id, chunk: `\n[exited ${code}]\n`, exited: code }); finish() })
    setTimeout(finish, 12_000)
  })
}
export function stopProcess(id: string) {
  const p = procs.get(id); if (!p) return
  try { if (process.platform !== 'win32' && p.child.pid) process.kill(-p.child.pid, 'SIGTERM'); else p.child.kill() } catch { /* ignore */ }
  p.info.running = false
}
export function listProcs(): ProcInfo[] { return [...procs.values()].map((p) => p.info) }
export function procLog(id: string): string { return procs.get(id)?.log ?? '' }
export function stopAll() { for (const id of procs.keys()) stopProcess(id) }
