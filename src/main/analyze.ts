import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import type { ModelTarget, ProjectAnalysis } from '../shared/types'
import { structuredCall } from './agent'
import { readTree } from './fs'

const dir = (root: string) => join(root, '.switchcoder')
const docPath = (root: string) => join(dir(root), 'PROJECT.md')
const metaPath = (root: string) => join(dir(root), 'project.json')

const ANALYSIS_TOOL = { name: 'submit_analysis', description: 'Submit the project analysis.', parameters: { type: 'object', properties: {
  overview: { type: 'string', description: '2-4 sentences in plain language: what this project is and does' },
  stack: { type: 'string', description: 'one line: framework, language, key libraries' },
  structure: { type: 'array', items: { type: 'string' }, description: 'important folders/files and what they are for, one line each, max 12' },
  entryPoints: { type: 'array', items: { type: 'string' }, description: 'where the app starts / main screens, max 6' },
  conventions: { type: 'array', items: { type: 'string' }, description: 'patterns to follow when adding code (state, styling, routing, data), max 8' },
  howToRun: { type: 'string', description: 'commands to install, run, build' },
  risks: { type: 'array', items: { type: 'string' }, description: 'things that look fragile or unfinished, max 5' },
}, required: ['overview', 'stack', 'structure', 'entryPoints', 'conventions', 'howToRun', 'risks'] } }

/** Cheap, deterministic facts gathered without the model. */
export async function facts(root: string): Promise<{ tree: string; pkg: string; readme: string; envKeys: string[]; entries: string; fingerprint: string }> {
  const t = await readTree(root, 4); const lines: string[] = []
  const walk = (n: typeof t, d: number) => { for (const c of n.children ?? []) { if (lines.length > 220) return; lines.push('  '.repeat(d) + (c.isDir ? c.name + '/' : c.name)); if (c.isDir) walk(c, d + 1) } }
  walk(t, 0)
  const read = (p: string, n: number) => { try { return readFileSync(join(root, p), 'utf8').slice(0, n) } catch { return '' } }
  const pkgRaw = read('package.json', 3000)
  let pkg = pkgRaw
  try { const j = JSON.parse(pkgRaw); pkg = JSON.stringify({ name: j.name, scripts: j.scripts, dependencies: Object.keys(j.dependencies ?? {}), devDependencies: Object.keys(j.devDependencies ?? {}).slice(0, 25) }) } catch { /* keep raw */ }
  const readme = read('README.md', 1500)
  const envKeys = (read('.env.local', 4000) + '\n' + read('.env', 4000)).split('\n').map((l) => l.split('=')[0].trim()).filter((k) => k && !k.startsWith('#'))
  const entryCandidates = ['src/main.tsx', 'src/main.ts', 'src/App.tsx', 'src/index.tsx', 'app/page.tsx', 'app/layout.tsx', 'src/app/page.tsx', 'pages/index.tsx', 'index.html', 'main.py', 'app.py', 'src/index.js', 'server.js']
  const entries = entryCandidates.filter((p) => existsSync(join(root, p))).map((p) => `### ${p}\n${read(p, 1200)}`).slice(0, 4).join('\n\n')
  const fingerprint = createHash('sha1').update(lines.join('\n') + '\n' + pkg).digest('hex').slice(0, 16)
  return { tree: lines.join('\n') || '(empty)', pkg, readme, envKeys, entries, fingerprint }
}

export function readDoc(root: string): { doc: string; fingerprint: string | null } | null {
  if (!existsSync(docPath(root))) return null
  let fingerprint: string | null = null
  try { fingerprint = JSON.parse(readFileSync(metaPath(root), 'utf8')).fingerprint } catch { /* none */ }
  return { doc: readFileSync(docPath(root), 'utf8'), fingerprint }
}

/** Analyze once; reuse while the fingerprint matches. Returns the doc text to use as model context. */
export async function ensureAnalysis(root: string, target: ModelTarget, apiKey: string | undefined, lang: 'ko' | 'en', signal: AbortSignal, onThink?: (s: string) => void): Promise<{ doc: string; fresh: boolean; modelCalls: number }> {
  const f = await facts(root)
  const existing = readDoc(root)
  if (existing && existing.fingerprint === f.fingerprint) return { doc: existing.doc, fresh: false, modelCalls: 0 }
  // tiny/fresh projects need no analysis
  if (f.tree.split('\n').length <= 3 && !f.pkg) return { doc: '', fresh: false, modelCalls: 0 }
  const { data, reasoning } = await structuredCall<ProjectAnalysis>({ target, apiKey, signal, tool: ANALYSIS_TOOL, maxTokens: 3072,
    system: `You are a senior engineer onboarding onto an existing codebase. Produce a short, accurate analysis that lets a small local coding model add features without re-reading the whole project. Write in ${lang === 'ko' ? 'Korean' : 'English'}, plain language, short lines. Only state what the evidence shows.`,
    user: `File tree:\n${f.tree}\n\npackage.json (summary):\n${f.pkg || '(none)'}\n\nREADME (head):\n${f.readme || '(none)'}\n\nEnv var names: ${f.envKeys.join(', ') || '(none)'}\n\nEntry files:\n${f.entries || '(none found)'}` })
  if (reasoning) onThink?.(reasoning.slice(0, 300))
  const ko = lang === 'ko'
  const doc = [`# ${ko ? '프로젝트 분석' : 'Project analysis'}`, '', data.overview, '', `## ${ko ? '스택' : 'Stack'}`, data.stack, '', `## ${ko ? '구조' : 'Structure'}`, ...data.structure.map((x) => `- ${x}`), '', `## ${ko ? '시작점' : 'Entry points'}`, ...data.entryPoints.map((x) => `- ${x}`), '', `## ${ko ? '코드 규칙' : 'Conventions'}`, ...data.conventions.map((x) => `- ${x}`), '', `## ${ko ? '실행 방법' : 'How to run'}`, data.howToRun, '', `## ${ko ? '주의' : 'Risks'}`, ...data.risks.map((x) => `- ${x}`), '', `## ${ko ? '변경 이력' : 'Change log'}`, ''].join('\n')
  mkdirSync(dir(root), { recursive: true })
  writeFileSync(docPath(root), doc)
  writeFileSync(metaPath(root), JSON.stringify({ fingerprint: f.fingerprint, analyzedAt: Date.now() }, null, 2))
  return { doc, fresh: true, modelCalls: 1 }
}

/** Append what was built so the doc becomes the project's memory (no model call). */
export async function appendChangelog(root: string, entry: string) {
  if (!existsSync(docPath(root))) return
  appendFileSync(docPath(root), `- ${new Date().toISOString().slice(0, 10)}: ${entry}\n`)
  const f = await facts(root)
  try { writeFileSync(metaPath(root), JSON.stringify({ fingerprint: f.fingerprint, analyzedAt: Date.now() }, null, 2)) } catch { /* ignore */ }
}
