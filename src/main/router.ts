import type { ChatMessage, RouteDecision, RouteMode } from '../shared/types'

const HEAVY = /refactor|리팩터|리팩토링|architect|설계|migrate|마이그레이션|전체|entire|whole codebase|across the|security audit|보안 점검|performance|성능 최적화|design a|rewrite|재작성/i

/**
 * The "Switch" router: decides whether a request should go to the local Flint model or a cloud model.
 * Local-first. Score 0-100, higher = more complex. Threshold is user-configurable.
 */
export function decideRoute(messages: ChatMessage[], mode: RouteMode, threshold: number, attachedFiles: number, byok = false): RouteDecision {
  const reasons: string[] = []
  if (!byok) return { target: 'local', score: 0, reasons: ['Local only (BYOK off)'] }
  if (mode === 'local' || mode === 'privacy-lock') return { target: 'local', score: 0, reasons: [mode === 'privacy-lock' ? 'Privacy lock: network disabled' : 'Manual: local'] }
  if (mode === 'cloud') return { target: 'cloud', score: 100, reasons: ['Manual: cloud'] }

  const last = messages[messages.length - 1]?.content ?? ''
  const totalChars = messages.reduce((n, m) => n + m.content.length, 0)
  let score = 0
  if (totalChars > 24_000) { score += 35; reasons.push('Large context') } else if (totalChars > 10_000) { score += 15; reasons.push('Medium context') }
  if (attachedFiles >= 4) { score += 25; reasons.push(`${attachedFiles} files attached`) } else if (attachedFiles >= 2) { score += 10 }
  if (HEAVY.test(last)) { score += 35; reasons.push('Architecture / cross-file task') }
  if (last.length > 1500) { score += 10; reasons.push('Long instruction') }
  const turns = messages.filter((m) => m.role === 'user').length
  if (turns > 12) { score += 10; reasons.push('Long conversation') }
  if (score === 0) reasons.push('Small, local-friendly task')
  return { target: score >= threshold ? 'cloud' : 'local', score: Math.min(100, score), reasons }
}

/** Flint works best on small, concrete steps. Ask the model to split a large task into a checklist. */
export const PLANNER_SYSTEM = `You are a senior engineer. Split the user's task into 3-8 small, concrete, independently verifiable steps that a small local coding model can complete one at a time. Output ONLY a JSON array of objects: [{"title": string, "detail": string, "files": string[]}]. No prose.`

export const CODER_SYSTEM = (lang: 'ko' | 'en', projectRoot: string | null) =>
  `You are SwitchCoder, a precise coding assistant inside a code editor${projectRoot ? ` (project: ${projectRoot})` : ''}.
Reply in ${lang === 'ko' ? 'Korean' : 'English'} unless the user writes in another language.
When you change code, output full replacement blocks as fenced code with the file path on the first line as a comment, e.g. \`\`\`ts // path: src/foo.ts\`\`\`.
Keep thinking brief. Keep answers short and concrete. Do not restate the question.`
