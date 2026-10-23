import { dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join, basename, relative } from 'path'
import type { FileNode } from '../shared/types'
import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

// Sandbox (Mac App Store): remember security-scoped bookmarks so recent projects reopen without a dialog.
const isMas = process.mas === true
const bookmarksFile = () => join(app.getPath('userData'), 'bookmarks.json')
function loadBookmarks(): Record<string, string> { try { return JSON.parse(readFileSync(bookmarksFile(), 'utf8')) } catch { return {} } }
function saveBookmark(path: string, bookmark: string) { const b = loadBookmarks(); b[path] = bookmark; mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(bookmarksFile(), JSON.stringify(b)) }
const active = new Map<string, () => void>()
/** Start (or re-start) sandbox access to a previously picked folder. No-op outside the App Store build. */
export function accessFolder(path: string): boolean {
  if (!isMas) return true
  if (active.has(path)) return true
  const bm = loadBookmarks()[path]; if (!bm) return false
  try { const stop = app.startAccessingSecurityScopedResource(bm) as unknown as () => void; active.set(path, stop); return true } catch { return false }
}

const IGNORE = new Set(['node_modules', '.git', 'dist', 'out', 'release', 'build', '.next', 'target', '__pycache__', '.DS_Store', '.venv', 'venv'])

export async function pickFolder(win: BrowserWindow): Promise<string | null> {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], securityScopedBookmarks: isMas })
  if (r.canceled || !r.filePaths[0]) return null
  const path = r.filePaths[0]
  if (isMas && r.bookmarks?.[0]) { saveBookmark(path, r.bookmarks[0]); accessFolder(path) }
  return path
}

export async function readTree(root: string, depth = 6): Promise<FileNode> {
  async function walk(dir: string, d: number): Promise<FileNode[]> {
    if (d <= 0) return []
    let entries: import('fs').Dirent[]
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return [] }
    const nodes: FileNode[] = []
    for (const e of entries) {
      if (IGNORE.has(e.name)) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) nodes.push({ name: e.name, path: p, isDir: true, children: await walk(p, d - 1) })
      else if (e.isFile()) nodes.push({ name: e.name, path: p, isDir: false })
    }
    nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    return nodes
  }
  return { name: basename(root), path: root, isDir: true, children: await walk(root, depth) }
}

export async function readFile(p: string): Promise<string> {
  const st = await fs.stat(p)
  if (st.size > 2 * 1024 * 1024) throw new Error('File too large to open (>2MB)')
  return fs.readFile(p, 'utf8')
}
export async function writeFile(p: string, content: string): Promise<void> { await fs.writeFile(p, content, 'utf8') }
export async function createFile(p: string): Promise<void> { await fs.writeFile(p, '', { flag: 'wx' }) }
export async function createDir(p: string): Promise<void> { await fs.mkdir(p, { recursive: true }) }
export async function removePath(p: string): Promise<void> { await fs.rm(p, { recursive: true }) }
export async function renamePath(a: string, b: string): Promise<void> { await fs.rename(a, b) }

/** Grep-like search over text files for @codebase context (simple, synchronous-ish, capped). */
export async function searchText(root: string, query: string, max = 40): Promise<{ path: string; line: number; text: string }[]> {
  const out: { path: string; line: number; text: string }[] = []
  const q = query.toLowerCase()
  async function walk(dir: string, d: number) {
    if (d <= 0 || out.length >= max) return
    let entries: import('fs').Dirent[]
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (out.length >= max) return
      if (IGNORE.has(e.name)) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) { await walk(p, d - 1); continue }
      if (!/\.(ts|tsx|js|jsx|py|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|rb|php|md|json|yml|yaml|toml|css|scss|html|sh|sql)$/i.test(e.name)) continue
      try {
        const st = await fs.stat(p); if (st.size > 512 * 1024) continue
        const text = await fs.readFile(p, 'utf8')
        const lines = text.split('\n')
        for (let i = 0; i < lines.length && out.length < max; i++) {
          if (lines[i].toLowerCase().includes(q)) out.push({ path: relative(root, p), line: i + 1, text: lines[i].trim().slice(0, 200) })
        }
      } catch { /* skip */ }
    }
  }
  await walk(root, 8)
  return out
}
