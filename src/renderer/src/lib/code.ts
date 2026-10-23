export interface Block { lang: string; path: string | null; code: string }
const FENCE = /```([\w+-]*)[^\n]*\n([\s\S]*?)```/g
const PATH_IN_INFO = /(?:path|file)\s*[:=]\s*([^\s`]+)/i
const PATH_IN_FIRST_LINE = /^\s*(?:\/\/|#|--|<!--|\/\*)\s*(?:path|file)?\s*:?\s*([\w./\\-]+\.[\w]+)\s*(?:\*\/|-->)?\s*$/

/** Parse fenced code blocks and detect a target file path from the info string or first-line comment. */
export function parseBlocks(md: string): Block[] {
  const out: Block[] = []
  for (const m of md.matchAll(FENCE)) {
    const info = m[0].split('\n')[0]
    let path: string | null = info.match(PATH_IN_INFO)?.[1] ?? null
    let code = m[2]
    const first = code.split('\n')[0] ?? ''
    const fl = first.match(PATH_IN_FIRST_LINE)
    if (fl) { path = path ?? fl[1]; code = code.split('\n').slice(1).join('\n') }
    out.push({ lang: m[1] || '', path, code: code.replace(/\n$/, '') })
  }
  return out
}
export function extractCode(md: string): string { const b = parseBlocks(md); return b.length ? b[0].code : md.trim() }
export function safeJsonArray<T>(s: string): T[] | null { const m = s.match(/\[[\s\S]*\]/); if (!m) return null; try { const j = JSON.parse(m[0]); return Array.isArray(j) ? j : null } catch { return null } }
