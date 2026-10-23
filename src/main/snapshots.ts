import { spawn } from 'child_process'
import { existsSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Snapshot } from '../shared/types'

/** Undo for non-developers: a hidden git repo with automatic snapshots. Falls back silently when git is missing. */
function git(args: string[], cwd: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const p = spawn('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'SwitchCoder', GIT_AUTHOR_EMAIL: 'bot@switchcoder.app', GIT_COMMITTER_NAME: 'SwitchCoder', GIT_COMMITTER_EMAIL: 'bot@switchcoder.app' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d))
    p.on('close', (code) => resolve({ code, out })); p.on('error', () => resolve({ code: -1, out: 'git not available' }))
  })
}
let available: boolean | null = null
export async function gitAvailable(): Promise<boolean> { if (available == null) available = (await git(['--version'], process.cwd())).code === 0; return available }

export async function ensureRepo(root: string): Promise<boolean> {
  if (!(await gitAvailable())) return false
  if (!existsSync(join(root, '.git'))) {
    const r = await git(['init', '-q'], root); if (r.code !== 0) return false
    const gi = join(root, '.gitignore')
    const base = 'node_modules/\n.next/\ndist/\nbuild/\n.env*\n!.env.example\n.switchcoder/\n.vercel/\n.DS_Store\n'
    if (!existsSync(gi)) writeFileSync(gi, base); else { const cur = readFileSync(gi, 'utf8'); if (!cur.includes('node_modules')) writeFileSync(gi, cur + '\n' + base) }
  }
  return true
}
export async function snapshot(root: string, label: string): Promise<string | null> {
  if (!(await ensureRepo(root))) return null
  await git(['add', '-A'], root)
  const r = await git(['commit', '-q', '-m', `switchcoder: ${label}`, '--allow-empty'], root)
  if (r.code !== 0) return null
  const sha = (await git(['rev-parse', 'HEAD'], root)).out.trim()
  return sha || null
}
export async function list(root: string, limit = 30): Promise<Snapshot[]> {
  if (!existsSync(join(root, '.git'))) return []
  const r = await git(['log', `-${limit}`, '--format=%H%x1f%ct%x1f%s'], root)
  if (r.code !== 0) return []
  return r.out.trim().split('\n').filter(Boolean).map((l) => { const [sha, ct, s] = l.split('\x1f'); return { sha, at: Number(ct) * 1000, label: s.replace(/^switchcoder: /, '') } })
}
export async function restore(root: string, sha: string): Promise<boolean> {
  await snapshot(root, 'before undo')
  const r = await git(['reset', '--hard', sha], root)
  if (r.code !== 0) return false
  await git(['clean', '-fdq', '-e', 'node_modules', '-e', '.env.local', '-e', '.vercel'], root)
  return true
}
