/**
 * Brand sweep + parity score. Adapted from replica-skill (MIT, Jake Schincariol): sweep.py / parity.py.
 * Finds leftovers of a reference app (name, domain, brand colours) in the generated project so a
 * "make me something like X" build never ships with X's identity.
 */
import { promises as fs } from 'fs'
import { join, relative, extname } from 'path'
import type { BrandHit, ParityResult, ReconMap } from '../shared/types'

const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', '.nuxt', '.svelte-kit', 'dist', 'build', 'out', '.vercel', '.turbo', '.cache', 'coverage', '__pycache__', '.venv', 'venv', 'Pods', '.expo', 'DerivedData', '.gradle', '.switchcoder'])
const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'Podfile.lock', 'Cargo.lock', 'poetry.lock'])
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.pdf', '.zip', '.gz', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.mov', '.mp3', '.wav', '.avif', '.heic', '.psd', '.sketch', '.fig', '.jar', '.so', '.dylib'])
const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g

const normHex = (h: string) => { let x = h.toLowerCase().replace(/^#/, ''); if (x.length === 3) x = x.split('').map((c) => c + c).join(''); return '#' + x }
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function brandSweep(root: string, opts: { avoid: string[]; domains?: string[]; colors?: string[]; max?: number }): Promise<BrandHit[]> {
  const pats: { kind: 'name' | 'domain'; label: string; rx: RegExp }[] = []
  for (const n of opts.avoid) { const name = n.trim(); if (!name || name.length < 3) continue; const parts = name.split(/[\s_-]+/).filter(Boolean).map(esc); pats.push({ kind: 'name', label: name, rx: new RegExp(parts.join('[\\s_-]?'), 'i') }) }
  for (const d of opts.domains ?? []) { const dom = d.trim().toLowerCase(); if (dom) pats.push({ kind: 'domain', label: dom, rx: new RegExp(esc(dom), 'i') }) }
  const cols = new Set((opts.colors ?? []).filter((c) => /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(c.trim())).map(normHex))
  const hits: BrandHit[] = []
  const max = opts.max ?? 200
  const walk = async (dir: string) => {
    if (hits.length >= max) return
    let ents: import('fs').Dirent[]; try { ents = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
      if (hits.length >= max) return
      const p = join(dir, e.name); const rel = relative(root, p)
      if (e.isDirectory()) { if (SKIP_DIRS.has(e.name)) continue; for (const pt of pats) if (pt.kind === 'name' && pt.rx.test(e.name)) hits.push({ file: rel + '/', line: 0, kind: 'path', match: pt.label, text: 'folder name' }); await walk(p); continue }
      if (!e.isFile() || SKIP_FILES.has(e.name) || BINARY_EXT.has(extname(e.name).toLowerCase())) continue
      for (const pt of pats) if (pt.kind === 'name' && pt.rx.test(e.name)) hits.push({ file: rel, line: 0, kind: 'path', match: pt.label, text: 'file name' })
      let text: string; try { const st = await fs.stat(p); if (st.size > 2_000_000) continue; const buf = await fs.readFile(p); if (buf.subarray(0, 4096).includes(0)) continue; text = buf.toString('utf8') } catch { continue }
      const lines = text.split('\n')
      for (let i = 0; i < lines.length && hits.length < max; i++) {
        const line = lines[i]
        for (const pt of pats) if (pt.rx.test(line)) hits.push({ file: rel, line: i + 1, kind: pt.kind, match: pt.label, text: line.trim().slice(0, 160) })
        if (cols.size) for (const m of line.matchAll(HEX)) { const h = normHex(m[0]); if (cols.has(h)) hits.push({ file: rel, line: i + 1, kind: 'color', match: h, text: line.trim().slice(0, 160) }) }
      }
    }
  }
  await walk(root)
  return hits
}

export function renderHits(hits: BrandHit[]): string {
  if (!hits.length) return 'Clean. Nothing of the reference app\'s name, domain or colours found.'
  const by: Record<string, number> = {}
  const lines = hits.map((h) => { by[h.kind] = (by[h.kind] ?? 0) + 1; return `${h.kind.padEnd(7)} ${h.match.slice(0, 18).padEnd(18)} ${h.line ? `${h.file}:${h.line}` : h.file}  ${h.text}` })
  return lines.join('\n') + `\n\n${hits.length} hits (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}). Replace every one before launch.`
}

/** Feature parity against the recon map's feature list (must > should > could weighting as in parity.py). */
export function parity(recon: ReconMap, implemented: string[]): ParityResult {
  const w = { must: 3, should: 2, could: 1 } as const
  const done = new Set(implemented.map((s) => s.toLowerCase().trim()))
  let total = 0; let got = 0; const missing: ParityResult['missing'] = []
  for (const f of recon.features) { const ww = w[f.priority] ?? 1; total += ww; if (done.has(f.name.toLowerCase().trim())) got += ww; else missing.push({ name: f.name, priority: f.priority }) }
  return { total: recon.features.length, done: recon.features.length - missing.length, percent: total ? Math.round((got / total) * 100) : 0, missing: missing.sort((a, b) => (w[a.priority as 'must'] ?? 1) < (w[b.priority as 'must'] ?? 1) ? 1 : -1) }
}
