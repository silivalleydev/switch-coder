import { randomUUID } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import type { PipelineState, PipelineMode, Plan, Blueprint, ModelTarget, AgentEvent, QaResult, Activity } from '../shared/types'
import { runAgent, structuredCall } from './agent'
import { runCommand } from './procs'
import * as snaps from './snapshots'
import * as vercel from './vercel'
import { readTree } from './fs'
import { ensureAnalysis, appendChangelog } from './analyze'

type Emit = { state: (s: PipelineState) => void; agent: (e: AgentEvent) => void; activity: (a: Omit<Activity, 'id' | 'at'>) => void }
const runs = new Map<string, { state: PipelineState; ac: AbortController; emit: Emit; target: ModelTarget; apiKey?: string; lang: 'ko' | 'en' }>()
const stateFile = (root: string) => join(root, '.switchcoder', 'pipeline.json')

function save(st: PipelineState) { try { mkdirSync(join(st.root, '.switchcoder'), { recursive: true }); writeFileSync(stateFile(st.root), JSON.stringify(st, null, 2)) } catch { /* ignore */ } }
export function load(root: string): PipelineState | null { try { return JSON.parse(readFileSync(stateFile(root), 'utf8')) } catch { return null } }

const PLAN_TOOL = { name: 'submit_plan', description: 'Submit the product plan.', parameters: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string', description: '2-3 sentences, plain language for a non-developer' }, screens: { type: 'array', items: { type: 'string' }, description: 'screens/pages the user will see, 1-6' }, features: { type: 'array', items: { type: 'string' }, description: 'concrete features, 3-8, each one line' }, outOfScope: { type: 'array', items: { type: 'string' } } }, required: ['title', 'summary', 'screens', 'features', 'outOfScope'] } }
const BLUEPRINT_TOOL = { name: 'submit_blueprint', description: 'Submit the technical blueprint and task list.', parameters: { type: 'object', properties: { stack: { type: 'string', description: 'one line, e.g. "Vite + React + TypeScript, localStorage"' }, files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, purpose: { type: 'string' } }, required: ['path', 'purpose'] } }, dataModel: { type: 'array', items: { type: 'string' }, description: 'entities with fields, one line each' }, tasks: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string', description: 'what to implement, concrete, 1-3 sentences' }, files: { type: 'array', items: { type: 'string' } }, verify: { type: 'string', description: 'how to check it works, e.g. "npm run build passes" or "page shows list"' } }, required: ['title', 'detail', 'files', 'verify'] } } }, required: ['stack', 'files', 'dataModel', 'tasks'] } }

const isSmallProject = (root: string) => { try { const names = readdirSync(root).filter((n) => !['.git', '.switchcoder', '.DS_Store', 'node_modules'].includes(n)); return names.length <= 2 } catch { return true } }
const BIG = /만들어|만들고|앱|서비스|사이트|웹|app|build|create|make|website|dashboard|플랫폼|게임|game/i
export function decideMode(root: string, request: string, mode: PipelineMode): 'full' | 'quick' {
  if (mode !== 'auto') return mode
  const fresh = isSmallProject(root) || !existsSync(join(root, 'src'))
  const big = BIG.test(request) && request.length > 24
  const multi = (request.match(/[,，·]|그리고|and|\+|\n/g)?.length ?? 0) >= 2
  return fresh || (big && multi) || request.length > 160 ? 'full' : 'quick'
}

async function fileTreeText(root: string): Promise<string> {
  const tree = await readTree(root, 3); const lines: string[] = []
  const walk = (n: typeof tree, d: number) => { for (const c of n.children ?? []) { if (lines.length > 120) return; lines.push('  '.repeat(d) + (c.isDir ? c.name + '/' : c.name)); if (c.isDir) walk(c, d + 1) } }
  walk(tree, 0); return lines.join('\n') || '(empty)'
}
const pkg = (root: string): { scripts?: Record<string, string> } | null => { try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) } catch { return null } }

export function start(opts: { root: string; request: string; mode: PipelineMode; wantDeploy: boolean; target: ModelTarget; apiKey?: string; lang: 'ko' | 'en' }, emit: Emit): PipelineState {
  const prev = runs.get(opts.root); if (prev?.state.running) throw new Error('A build is already running for this project')
  const st: PipelineState = { id: randomUUID(), root: opts.root, request: opts.request, mode: decideMode(opts.root, opts.request, opts.mode), wantDeploy: opts.wantDeploy, stage: 'analyze', running: true, cancelled: false, awaiting: null, tasks: [], currentTask: 0, startedAt: Date.now(), updatedAt: Date.now(), modelCalls: 0 }
  const run = { state: st, ac: new AbortController(), emit, target: opts.target, apiKey: opts.apiKey, lang: opts.lang }
  runs.set(opts.root, run)
  void drive(run)
  return st
}

export function approve(root: string, edits?: { plan?: Plan; blueprint?: Blueprint }): PipelineState | null {
  const run = runs.get(root); if (!run) return null
  const st = run.state
  if (st.awaiting === 'approve-plan') { if (edits?.plan) st.plan = edits.plan; st.stage = 'blueprint' }
  else if (st.awaiting === 'approve-blueprint') { if (edits?.blueprint) { st.blueprint = edits.blueprint; st.tasks = edits.blueprint.tasks.map((t) => ({ ...t, status: 'todo', attempts: 0 })) } st.stage = 'build' }
  else if (st.awaiting === 'vercel-setup') { st.stage = 'deploy' }
  else if (st.awaiting === 'stopped') { /* resume where we were */ }
  else return st
  st.awaiting = null; st.running = true; st.cancelled = false; run.ac = new AbortController()
  void drive(run)
  return st
}
export function cancel(root: string): PipelineState | null { const run = runs.get(root); if (!run) return null; run.state.cancelled = true; run.ac.abort(); return run.state }
export function current(root: string): PipelineState | null { return runs.get(root)?.state ?? load(root) }
export function skipTask(root: string): PipelineState | null { const run = runs.get(root); if (!run) return null; const t = run.state.tasks[run.state.currentTask]; if (t && t.status !== 'done') { t.status = 'skipped'; run.state.currentTask++ } run.ac.abort(); return run.state }

async function drive(run: NonNullable<ReturnType<typeof runs.get>>) {
  const { state: st, emit } = run
  const touch = () => { st.updatedAt = Date.now(); save(st); emit.state({ ...st }) }
  const say = (kind: Activity['kind'], text: string, detail?: string) => emit.activity({ kind, text, detail })
  const ko = run.lang === 'ko'
  const ctx = () => (st.analysisDoc ? `Project notes (.switchcoder/PROJECT.md):\n${st.analysisDoc.slice(0, 2500)}\n\n` : '') + (st.plan && st.blueprint ? `Plan: ${st.plan.title} — ${st.plan.summary}\nFeatures: ${st.plan.features.join('; ')}\nStack: ${st.blueprint.stack}\nData: ${st.blueprint.dataModel.join('; ')}\nPlanned files: ${st.blueprint.files.map((f) => f.path).join(', ')}` : '')
  try {
    touch()
    // ---- ANALYZE (existing projects only; once per fingerprint)
    if (st.stage === 'analyze') {
      const a = await ensureAnalysis(st.root, run.target, run.apiKey, run.lang, run.ac.signal, (r) => say('think', ko ? '프로젝트 파악' : 'Understanding the project', r))
      if (a.fresh) say('ok', ko ? '프로젝트를 분석해 .switchcoder/PROJECT.md에 남겼습니다 (다음부터는 재사용)' : 'Analyzed the project into .switchcoder/PROJECT.md (reused from now on)')
      else if (a.doc) say('info', ko ? '이전 분석 문서를 재사용합니다' : 'Reusing the saved project analysis')
      st.analysisDoc = a.doc; st.analyzedFresh = a.fresh; st.modelCalls += a.modelCalls
      st.stage = st.mode === 'quick' ? 'build' : 'plan'; touch()
    }
    // ---- PLAN
    if (st.stage === 'plan') {
      say('info', ko ? '요청을 읽고 무엇을 만들지 정리하는 중' : 'Reading your request and shaping the plan')
      const tree = await fileTreeText(st.root)
      const { data, reasoning } = await structuredCall<Plan>({ target: run.target, apiKey: run.apiKey, signal: run.ac.signal, tool: PLAN_TOOL, maxTokens: 3072,
        system: `You are a product manager for a non-technical founder. Turn the request into a small, shippable v1. Be concrete and modest: a first version that can be built in one sitting. Write for someone who does not code. Language: ${ko ? 'Korean' : 'English'}.`,
        user: `Request:\n${st.request}\n\n${st.analysisDoc ? `Project notes:\n${st.analysisDoc.slice(0, 2500)}` : `Existing project files:\n${tree}`}` })
      st.modelCalls++; if (reasoning) say('think', ko ? '생각 정리' : 'Thinking', reasoning.slice(0, 300))
      st.plan = data; st.awaiting = 'approve-plan'; st.running = false
      say('ask', ko ? '기획안을 확인해 주세요. 고치고 싶은 게 있으면 수정 후 승인.' : 'Please review the plan. Edit if needed, then approve.')
      touch(); return
    }
    // ---- BLUEPRINT
    if (st.stage === 'blueprint') {
      say('info', ko ? '어떤 파일과 순서로 만들지 설계하는 중' : 'Designing files and the build order')
      const tree = await fileTreeText(st.root)
      const { data, reasoning } = await structuredCall<Blueprint>({ target: run.target, apiKey: run.apiKey, signal: run.ac.signal, tool: BLUEPRINT_TOOL, maxTokens: 4096,
        system: `You are a pragmatic tech lead. Choose the simplest stack that a small local coding model can implement reliably (prefer what already exists in the project; otherwise Vite + React + TypeScript; localStorage before databases unless the plan needs multi-user data). Split the work into 2-8 small tasks, each touching 1-3 files, ordered so the app runs after every task. The last task must be "run the app and verify". Keep every string short.`,
        user: `Plan:\n${JSON.stringify(st.plan)}\n\n${st.analysisDoc ? `Project notes:\n${st.analysisDoc.slice(0, 2500)}\n\n` : ''}Existing files:\n${tree}` })
      st.modelCalls++; if (reasoning) say('think', ko ? '설계 생각' : 'Design thinking', reasoning.slice(0, 300))
      st.blueprint = data; st.tasks = data.tasks.map((t) => ({ ...t, status: 'todo', attempts: 0 })); st.currentTask = 0
      st.awaiting = 'approve-blueprint'; st.running = false
      say('ask', ko ? `${st.tasks.length}단계로 나눴습니다. 승인하면 바로 만들기 시작합니다.` : `Split into ${st.tasks.length} steps. Approve to start building.`)
      touch(); return
    }
    // ---- BUILD
    if (st.stage === 'build') {
      if (st.mode === 'quick' && st.tasks.length === 0) st.tasks = [{ title: st.request.slice(0, 60), detail: st.request, files: [], verify: 'it works', status: 'todo', attempts: 0 }]
      for (; st.currentTask < st.tasks.length; st.currentTask++) {
        const t = st.tasks[st.currentTask]; if (t.status === 'done' || t.status === 'skipped') continue
        if (run.ac.signal.aborted) throw new Error('cancelled')
        t.status = 'running'; t.attempts++; touch()
        say('info', ko ? `${st.currentTask + 1}/${st.tasks.length} ${t.title}` : `${st.currentTask + 1}/${st.tasks.length} ${t.title}`)
        await snaps.snapshot(st.root, `before: ${t.title}`)
        const taskPrompt = st.mode === 'quick' ? st.request : `Task ${st.currentTask + 1} of ${st.tasks.length}: ${t.title}\n${t.detail}\nFiles: ${t.files.join(', ') || '(your choice)'}\nDone when: ${t.verify}\nOnly do this task. Do not start a dev server unless this is the final verification task; use "npm run build" or a quick run to check instead.`
        let ok = false; let lastErr = ''
        const msgs = await runAgent({ root: st.root, task: taskPrompt, target: run.target, apiKey: run.apiKey, lang: run.lang, history: [], signal: run.ac.signal, context: ctx(), maxIterations: 14, allowDeploy: false }, (ev) => {
          emit.agent(ev); st.modelCalls += ev.type === 'tool_call' ? 0 : 0
          if (ev.type === 'done') ok = true
          if (ev.type === 'error') lastErr = ev.message
          if (ev.type === 'tool_result' && !ev.ok) lastErr = ev.output.slice(-400)
        })
        st.modelCalls += msgs.filter((m) => m.role === 'assistant').length
        if (run.ac.signal.aborted) throw new Error('cancelled')
        if (ok) { t.status = 'done'; say('ok', ko ? `완료: ${t.title}` : `Done: ${t.title}`) }
        else if (t.attempts < 2) { t.status = 'todo'; t.note = lastErr; st.currentTask--; say('fix', ko ? '이 단계가 잘 안 돼서 한 번 더 시도' : 'Step did not finish; trying once more', lastErr) }
        else { t.status = 'failed'; t.note = lastErr; say('error', ko ? `건너뜀: ${t.title} (2회 실패)` : `Skipped: ${t.title} (failed twice)`, lastErr) }
        touch()
      }
      st.stage = 'qa'; touch()
    }
    // ---- QA (no model unless something fails)
    if (st.stage === 'qa') {
      const p = pkg(st.root); const checks: QaResult['checks'] = []
      const cands: { name: string; command: string }[] = []
      if (p?.scripts?.build) cands.push({ name: 'build', command: 'npm run build' })
      else if (existsSync(join(st.root, 'tsconfig.json'))) cands.push({ name: 'typecheck', command: 'npx tsc --noEmit' })
      if (p?.scripts?.test && !/no test specified/.test(p.scripts.test)) cands.push({ name: 'test', command: 'npm test -- --run' })
      if (existsSync(join(st.root, 'main.py'))) cands.push({ name: 'python', command: 'python3 -m py_compile main.py' })
      let fixAttempts = 0
      for (let round = 0; round < 4; round++) {
        checks.length = 0
        for (const c of cands) {
          if (run.ac.signal.aborted) throw new Error('cancelled')
          say('cmd', ko ? `검사: ${c.name}` : `Check: ${c.name}`, c.command)
          const r = await runCommand(c.command, st.root, 240_000)
          checks.push({ name: c.name, command: c.command, ok: r.code === 0, output: r.output.slice(-3000) })
        }
        const failed = checks.filter((c) => !c.ok)
        if (failed.length === 0 || round === 3) break
        fixAttempts++
        say('fix', ko ? `${failed.map((f) => f.name).join(', ')} 검사에 실패해서 고치는 중 (${fixAttempts}/3)` : `Fixing failed checks: ${failed.map((f) => f.name).join(', ')} (${fixAttempts}/3)`, failed[0].output.slice(-500))
        await snaps.snapshot(st.root, `before QA fix ${fixAttempts}`)
        await runAgent({ root: st.root, task: `The following checks fail. Fix the code so they pass, then finish.\n${failed.map((f) => `### ${f.command}\n${f.output.slice(-2500)}`).join('\n\n')}`, target: run.target, apiKey: run.apiKey, lang: run.lang, history: [], signal: run.ac.signal, context: ctx(), maxIterations: 12, allowDeploy: false }, emit.agent)
        if (run.ac.signal.aborted) throw new Error('cancelled')
      }
      st.qa = { ok: checks.every((c) => c.ok), checks, fixAttempts }
      say(st.qa.ok ? 'ok' : 'error', st.qa.ok ? (ko ? (cands.length ? 'QA 통과: 빌드가 정상입니다' : 'QA: 검사할 빌드 스크립트가 없어 건너뜀') : 'QA passed') : (ko ? 'QA 실패가 남았습니다. 아래 결과를 확인하세요.' : 'Some QA checks still fail.'))
      await snaps.snapshot(st.root, 'after QA')
      st.stage = st.wantDeploy ? 'deploy' : 'done'; touch()
    }
    // ---- DEPLOY
    if (st.stage === 'deploy') {
      const vs = await vercel.status(st.root)
      if (!vs.loggedIn || !vs.project) {
        st.awaiting = 'vercel-setup'; st.running = false
        say('ask', ko ? (vs.loggedIn ? '배포하려면 Vercel 프로젝트 링크가 필요합니다. 배포 탭에서 2단계까지 마치고 "계속"을 누르세요.' : '배포하려면 Vercel 연결이 필요합니다. 배포 탭에서 로그인·링크 후 "계속"을 누르세요.') : 'Deploy needs Vercel connected. Finish steps 1-2 in the Deploy tab, then press Continue.')
        touch(); return
      }
      say('cmd', ko ? 'Vercel에 배포 중 (1~3분)' : 'Deploying to Vercel (1-3 min)')
      const r = await vercel.deploy(st.root, true, undefined, () => { /* terminal already streams via ipc in index */ })
      if (r.ok && r.url) { st.deployUrl = r.url; say('ok', ko ? `배포 완료: ${r.url}` : `Deployed: ${r.url}`) } else { say('error', ko ? '배포 실패. 터미널 출력을 확인하세요.' : 'Deploy failed. See terminal.', r.output.slice(-800)) }
      st.stage = 'done'; touch()
    }
    if (st.stage === 'done') { st.running = false; st.awaiting = null; await appendChangelog(st.root, `${st.plan?.title ?? st.request.slice(0, 60)} — ${st.tasks.filter((t) => t.status === 'done').map((t) => t.title).join(', ') || 'quick edit'}${st.deployUrl ? ` (deployed ${st.deployUrl})` : ''}`); const min = Math.round((Date.now() - st.startedAt) / 60000); say('ok', ko ? `끝났습니다. ${st.tasks.filter((t) => t.status === 'done').length}/${st.tasks.length} 단계 완료, 모델 호출 ${st.modelCalls}회, ${min}분.` : `All done. ${st.tasks.filter((t) => t.status === 'done').length}/${st.tasks.length} steps, ${st.modelCalls} model calls, ${min} min.`); touch() }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    st.running = false
    if (msg === 'cancelled' || run.ac.signal.aborted) { st.awaiting = 'stopped'; const t = st.tasks[st.currentTask]; if (t?.status === 'running') t.status = 'todo'; say('info', ko ? '멈췄습니다. "계속"으로 이어서 할 수 있습니다.' : 'Stopped. Press Continue to resume.') }
    else { st.error = msg; st.awaiting = 'stopped'; say('error', msg) }
    touch()
  }
}
