import git from 'isomorphic-git'
import * as fs from 'fs'
import { promises as fsp } from 'fs'
import { existsSync, writeFileSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import type { Snapshot } from '../shared/types'

/**
 * Undo for non-developers: a hidden git repo with automatic snapshots.
 * Pure JS (isomorphic-git) so it works with no git installed and never triggers the
 * "install Xcode command line tools" prompt on a fresh Mac, and inside the App Store sandbox.
 */
const author = { name: 'SwitchCoder', email: 'bot@switchcoder.app' }
const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', '.vercel', '.switchcoder', '.DS_Store', '.cache', 'coverage', '.expo', '__pycache__', '.venv', 'venv'])

export async function gitAvailable(): Promise<boolean> { return true }

export async function ensureRepo(root: string): Promise<boolean> {
  if (!existsSync(join(root, '.git'))) {
    await git.init({ fs, dir: root, defaultBranch: 'main' })
    const gi = join(root, '.gitignore')
    const base = 'node_modules/\n.next/\ndist/\nbuild/\n.env*\n!.env.example\n.switchcoder/\n.vercel/\n.DS_Store\n'
    if (!existsSync(gi)) writeFileSync(gi, base); else { const cur = readFileSync(gi, 'utf8'); if (!cur.includes('node_modules')) writeFileSync(gi, cur + '\n' + base) }
  }
  return true
}

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string) => {
    let ents: fs.Dirent[]; try { ents = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (IGNORE_DIRS.has(e.name)) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile()) { if (out.length < 5000) out.push(relative(root, p).split('\\').join('/')) }
    }
  }
  await walk(root)
  return out
}

/** Stage everything (adds, modifications, deletions) respecting .gitignore, then commit. */
export async function snapshot(root: string, label: string): Promise<string | null> {
  try {
    await ensureRepo(root)
    const files = await listFiles(root)
    const matrix = await git.statusMatrix({ fs, dir: root, filepaths: files.length ? files : ['.'] }).catch(() => [] as [string, number, number, number][])
    for (const [filepath, head, workdir] of matrix) {
      if (workdir === 0 && head !== 0) await git.remove({ fs, dir: root, filepath })
    }
    for (const f of files) {
      if (await git.isIgnored({ fs, dir: root, filepath: f })) continue
      await git.add({ fs, dir: root, filepath: f })
    }
    const sha = await git.commit({ fs, dir: root, message: `switchcoder: ${label}`, author })
    return sha
  } catch (e) { console.warn('snapshot failed', e); return null }
}

export async function list(root: string, limit = 30): Promise<Snapshot[]> {
  if (!existsSync(join(root, '.git'))) return []
  try {
    const log = await git.log({ fs, dir: root, depth: limit })
    return log.map((c) => ({ sha: c.oid, at: c.commit.committer.timestamp * 1000, label: c.commit.message.trim().replace(/^switchcoder: /, '') }))
  } catch { return [] }
}

/** Restore a snapshot: check out tracked files from that commit and delete files it did not have. */
export async function restore(root: string, sha: string): Promise<boolean> {
  try {
    await snapshot(root, 'before undo')
    await git.checkout({ fs, dir: root, ref: sha, force: true })
    // remove files that exist now but were not in the snapshot (ignored paths untouched)
    const files = await listFiles(root)
    const matrix = await git.statusMatrix({ fs, dir: root, filepaths: files.length ? files : ['.'] }).catch(() => [] as [string, number, number, number][])
    for (const [filepath, head, workdir] of matrix) {
      if (head === 0 && workdir !== 0 && !(await git.isIgnored({ fs, dir: root, filepath }))) { try { await fsp.rm(join(root, filepath)) } catch { /* ignore */ } }
    }
    // move the branch pointer so later snapshots continue from here
    await git.branch({ fs, dir: root, ref: 'main', object: sha, force: true, checkout: true }).catch(() => { /* detached is fine */ })
    return true
  } catch (e) { console.warn('restore failed', e); return false }
}
