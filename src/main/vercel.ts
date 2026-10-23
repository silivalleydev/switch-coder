import { spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { app, shell } from 'electron'
import { toolchainEnv } from './toolchain'
import type { VercelStatus, DbProvider } from '../shared/types'

/** Path to the Vercel CLI entry: bundled node_modules in dev, unpacked in the packaged app. */
function cliPath(): string {
  const rel = join('node_modules', 'vercel', 'dist', 'index.js')
  const dev = join(app.getAppPath(), rel)
  if (existsSync(dev)) return dev
  const unpacked = join(process.resourcesPath, 'app.asar.unpacked', rel)
  return unpacked
}
const globalConfigDir = () => join(app.getPath('userData'), 'vercel')
function legacyAuthPath(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'com.vercel.cli', 'auth.json')
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'com.vercel.cli', 'auth.json')
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'com.vercel.cli', 'auth.json')
}

type Out = (chunk: string) => void
const URL_RE = /https?:\/\/[^\s"'`)\]]+/g

/** Run the Vercel CLI with Node (so we do not depend on a global install). */
export function vc(args: string[], cwd: string, opts: { token?: string; interactive?: boolean; onOutput?: Out; timeoutMs?: number } = {}): Promise<{ code: number | null; output: string; stdout: string }> {
  return new Promise((resolve) => {
    const full = [cliPath(), ...args, '--global-config', globalConfigDir(), ...(opts.token ? ['--token', opts.token] : []), ...(opts.interactive ? [] : ['--non-interactive']), '--no-color']
    const env = { ...process.env, ...toolchainEnv(), FORCE_COLOR: '0', NO_COLOR: '1', ...(opts.interactive ? {} : { CI: '1' }) }
    const p = spawn(process.execPath, full, { cwd, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; let so = ''
    const push = (d: Buffer) => { const s = d.toString(); out += s; opts.onOutput?.(s) }
    p.stdout.on('data', (d: Buffer) => { so += d.toString(); push(d) }); p.stderr.on('data', push)
    const t = setTimeout(() => { try { p.kill('SIGKILL') } catch { /* ignore */ } }, opts.timeoutMs ?? 300_000)
    p.on('close', (code) => { clearTimeout(t); resolve({ code, output: out, stdout: so }) })
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, output: out + e.message, stdout: so }) })
  })
}

export async function status(root: string | null, token?: string): Promise<VercelStatus> {
  const loggedIn = !!token || existsSync(join(globalConfigDir(), 'auth.json')) || (process.mas !== true && existsSync(legacyAuthPath()))
  let user: string | undefined
  if (loggedIn) { const r = await vc(['whoami'], root ?? homedir(), { token, timeoutMs: 20_000 }); if (r.code === 0) user = r.stdout.trim().split('\n').filter((l) => l && !/^Vercel CLI/.test(l)).pop()?.trim() }
  let project: VercelStatus['project']
  if (root && existsSync(join(root, '.vercel', 'project.json'))) { try { const j = JSON.parse(readFileSync(join(root, '.vercel', 'project.json'), 'utf8')); project = { id: j.projectId, orgId: j.orgId, name: j.projectName } } catch { /* ignore */ } }
  const envFile = root ? join(root, '.env.local') : ''
  const envKeys = envFile && existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n').map((l) => l.split('=')[0].trim()).filter((k) => k && !k.startsWith('#')) : []
  const db: DbProvider | null = envKeys.some((k) => /SUPABASE/.test(k)) ? 'supabase' : envKeys.some((k) => /^(DATABASE_URL|POSTGRES_URL|NEON)/.test(k)) ? 'neon' : null
  return { cliAvailable: existsSync(cliPath()), loggedIn: !!user || (loggedIn && !token), user, project, db, envKeys }
}

/** Interactive device login: opens the verification URL in the browser; resolves when the CLI exits. */
export async function login(onOutput: Out): Promise<{ ok: boolean; output: string }> {
  let opened = false
  const r = await vc(['login'], homedir(), { interactive: true, timeoutMs: 600_000, onOutput: (s) => {
    onOutput(s)
    if (!opened) { const m = s.match(URL_RE); const u = m?.find((x) => /vercel\.com/.test(x)); if (u) { opened = true; void shell.openExternal(u) } }
  } })
  return { ok: r.code === 0, output: r.output }
}

export async function link(root: string, name: string, token: string | undefined, onOutput: Out) {
  const r = await vc(['link', '--yes', '--project', name], root, { token, onOutput })
  return { ok: r.code === 0, output: r.output }
}

/** Provision a marketplace database. Tries the CLI first (non-interactive); falls back to opening the marketplace page. */
export async function addDb(root: string, provider: DbProvider, token: string | undefined, onOutput: Out): Promise<{ ok: boolean; manual?: string; output: string }> {
  const r = await vc(['integration', 'add', provider, '--no-claim', '--name', `${provider}-${Date.now().toString(36)}`], root, { token, onOutput, timeoutMs: 600_000 })
  if (r.code === 0) return { ok: true, output: r.output }
  const url = `https://vercel.com/marketplace/${provider}`
  void shell.openExternal(url)
  return { ok: false, manual: url, output: r.output }
}

export async function envPull(root: string, token: string | undefined, onOutput: Out) {
  const r = await vc(['env', 'pull', '.env.local', '--yes'], root, { token, onOutput })
  return { ok: r.code === 0, output: r.output }
}

export async function deploy(root: string, prod: boolean, token: string | undefined, onOutput: Out): Promise<{ ok: boolean; url?: string; inspect?: string; output: string }> {
  const r = await vc(['deploy', '--yes', ...(prod ? ['--prod'] : [])], root, { token, onOutput, timeoutMs: 900_000 })
  const urls = r.output.match(URL_RE) ?? []
  const prodLine = r.output.match(/(?:Production|Preview|Aliased):\s*(https?:\/\/\S+)/i)?.[1]
  const url = prodLine ?? urls.filter((u) => /\.vercel\.app/.test(u) && !/vercel\.com/.test(u)).pop()
  const inspect = urls.find((u) => /vercel\.com\/.+\/deployments?\//.test(u) || /Inspect/.test(u))
  return { ok: r.code === 0, url: url?.replace(/[.,]$/, ''), inspect, output: r.output }
}
