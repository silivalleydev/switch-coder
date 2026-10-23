import { useEffect, useRef, useState } from 'react'
import { Check, Circle, Loader2, Square, SkipForward, Play, Undo2, Brain, FileText, TerminalSquare, AlertTriangle, Wrench, CheckCircle2, MessageSquare, Rocket, ChevronDown } from 'lucide-react'
import { useStore } from '../store'
import { STAGE_LABEL } from '../lib/humanize'
import type { Activity, Plan, Blueprint, Stage, ReconMap } from '../../../shared/types'

const ORDER: Stage[] = ['analyze', 'recon', 'plan', 'blueprint', 'build', 'qa', 'deploy', 'done']
const ICON: Record<Activity['kind'], React.ReactNode> = { info: <MessageSquare size={13} />, think: <Brain size={13} />, file: <FileText size={13} />, cmd: <TerminalSquare size={13} />, error: <AlertTriangle size={13} />, fix: <Wrench size={13} />, ok: <CheckCircle2 size={13} />, ask: <MessageSquare size={13} /> }

function ProgressMap() {
  const { pipeline: p, settings, cancelPipeline, approvePipeline, skipTask } = useStore()
  const lang = settings?.language ?? 'ko'; const ko = lang === 'ko'
  if (!p) return null
  const stages = ORDER.filter((s) => s !== 'done' && (s !== 'deploy' || p.wantDeploy) && (s !== 'analyze' || p.analysisDoc !== undefined || p.stage === 'analyze') && (s !== 'recon' || !!p.reference) && !(p.mode === 'quick' && (s === 'plan' || s === 'blueprint')))
  const idx = ORDER.indexOf(p.stage)
  const cur = p.tasks[p.currentTask]
  const elapsed = Math.max(1, Math.round((Date.now() - p.startedAt) / 60000))
  return (
    <div className="pmap">
      <div className="stages">
        {stages.map((s) => { const si = ORDER.indexOf(s); const done = si < idx || p.stage === 'done'; const active = s === p.stage && p.stage !== 'done'
          return <span key={s} className={'stage' + (done ? ' done' : active ? ' active' : '')}>{done ? <Check size={11} /> : active ? (p.running ? <Loader2 size={11} className="spin" /> : <Circle size={11} />) : <Circle size={11} />} {STAGE_LABEL[s][lang]}{s === 'build' && p.tasks.length > 0 ? ` ${p.tasks.filter((t) => t.status === 'done').length}/${p.tasks.length}` : ''}</span> })}
      </div>
      <div className="now">
        {p.stage === 'done' ? <span className="ok">{ko ? '완료' : 'Done'}{p.deployUrl ? ` · ${p.deployUrl}` : ''}</span>
          : p.awaiting === 'stopped' ? <span className="muted">{ko ? '멈춤' : 'Stopped'}{p.error ? ` · ${p.error.slice(0, 120)}` : ''}</span>
          : p.awaiting ? <span className="muted">{ko ? '확인 대기 중' : 'Waiting for you'}</span>
          : <span>{p.stage === 'build' && cur ? `${p.currentTask + 1}/${p.tasks.length} · ${cur.title}` : STAGE_LABEL[p.stage][lang]}</span>}
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 11 }}>{p.mode === 'quick' ? (ko ? '빠른 수정' : 'quick') : (ko ? '전체 과정' : 'full')} · {elapsed}{ko ? '분' : 'm'} · {p.modelCalls}{ko ? '회 호출' : ' calls'}</span>
        {p.running && <button className="sm" onClick={() => void cancelPipeline()}><Square size={11} /> {ko ? '멈춤' : 'Stop'}</button>}
        {p.running && p.stage === 'build' && <button className="ghost sm" title={ko ? '이 단계 건너뛰기' : 'Skip this step'} onClick={() => void skipTask()}><SkipForward size={11} /></button>}
        {p.awaiting === 'stopped' && p.stage !== 'done' && <button className="primary sm" onClick={() => void approvePipeline()}><Play size={11} /> {ko ? '계속' : 'Continue'}</button>}
      </div>
      {p.tasks.length > 0 && p.stage !== 'done' && (
        <div className="tasks">{p.tasks.map((t, i) => <span key={i} className={'task ' + t.status} title={t.detail}>{t.status === 'done' ? '✓' : t.status === 'running' ? '…' : t.status === 'failed' ? '✕' : t.status === 'skipped' ? '↷' : i + 1} {t.title}</span>)}</div>
      )}
    </div>
  )
}

function PlanCard({ plan }: { plan: Plan }) {
  const { approvePipeline, cancelPipeline, settings } = useStore(); const ko = (settings?.language ?? 'ko') === 'ko'
  const [edit, setEdit] = useState(false)
  const [text, setText] = useState(() => [`# ${plan.title}`, plan.summary, '', `## ${ko ? '화면' : 'Screens'}`, ...plan.screens.map((s) => `- ${s}`), '', `## ${ko ? '기능' : 'Features'}`, ...plan.features.map((s) => `- ${s}`), '', `## ${ko ? '이번엔 안 함' : 'Not now'}`, ...plan.outOfScope.map((s) => `- ${s}`)].join('\n'))
  const parse = (): Plan => { const sec = (h: RegExp) => { const m = text.split(/\n## /).find((b) => h.test(b)); return m ? m.split('\n').slice(1).filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim()) : [] }
    const title = text.match(/^# (.+)$/m)?.[1]?.trim() ?? plan.title; const summary = text.split('\n').slice(1).find((l) => l.trim() && !l.startsWith('#')) ?? plan.summary
    return { title, summary, screens: sec(/^(화면|Screens)/), features: sec(/^(기능|Features)/), outOfScope: sec(/^(이번엔|Not now)/) } }
  return (
    <div className="card plan">
      <div className="card-h"><strong>{ko ? '기획안' : 'Plan'}</strong><span className="spacer" /><button className="ghost sm" onClick={() => setEdit(!edit)}>{edit ? (ko ? '미리보기' : 'Preview') : (ko ? '수정' : 'Edit')}</button></div>
      {edit ? <textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} /> : (
        <div className="plan-body"><h3>{plan.title}</h3><p>{plan.summary}</p>
          <div className="cols"><div><b>{ko ? '화면' : 'Screens'}</b><ul>{plan.screens.map((s) => <li key={s}>{s}</li>)}</ul></div><div><b>{ko ? '기능' : 'Features'}</b><ul>{plan.features.map((s) => <li key={s}>{s}</li>)}</ul></div></div>
          {plan.outOfScope.length > 0 && <div className="muted" style={{ fontSize: 11 }}>{ko ? '이번엔 안 함: ' : 'Not now: '}{plan.outOfScope.join(' · ')}</div>}</div>)}
      <div className="card-f"><button onClick={() => void cancelPipeline()}>{ko ? '취소' : 'Cancel'}</button><button className="primary" onClick={() => void approvePipeline({ plan: edit ? parse() : plan })}>{ko ? '좋아요, 설계로' : 'Approve, design it'}</button></div>
    </div>
  )
}

function BlueprintCard({ bp }: { bp: Blueprint }) {
  const { approvePipeline, cancelPipeline, settings } = useStore(); const ko = (settings?.language ?? 'ko') === 'ko'
  const [tasks, setTasks] = useState(bp.tasks)
  const [showFiles, setShowFiles] = useState(false)
  return (
    <div className="card plan">
      <div className="card-h"><strong>{ko ? '설계 · 작업 순서' : 'Design · steps'}</strong><span className="muted" style={{ fontSize: 11 }}>{bp.stack}</span></div>
      <ol className="steps-list">{tasks.map((t, i) => <li key={i}><input value={t.title} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /><div className="muted" style={{ fontSize: 11 }}>{t.detail}</div></li>)}</ol>
      <div className="muted" style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => setShowFiles(!showFiles)}><ChevronDown size={11} /> {ko ? `파일 ${bp.files.length}개 · 데이터 ${bp.dataModel.length}개` : `${bp.files.length} files · ${bp.dataModel.length} data items`}</div>
      {showFiles && <ul className="muted" style={{ fontSize: 11 }}>{bp.files.map((f) => <li key={f.path}><code>{f.path}</code> — {f.purpose}</li>)}{bp.dataModel.map((d) => <li key={d}>{d}</li>)}</ul>}
      <div className="card-f"><button onClick={() => void cancelPipeline()}>{ko ? '취소' : 'Cancel'}</button><button className="primary" onClick={() => void approvePipeline({ blueprint: { ...bp, tasks } })}>{ko ? '시작' : 'Start building'}</button></div>
    </div>
  )
}

function ReconCard({ recon }: { recon: ReconMap }) {
  const { approvePipeline, cancelPipeline, settings, pipeline } = useStore(); const ko = (settings?.language ?? 'ko') === 'ko'
  const [features, setFeatures] = useState(recon.features)
  const [angle, setAngle] = useState(recon.angle)
  const cycle = (i: number) => setFeatures(features.map((f, j) => (j === i ? { ...f, priority: f.priority === 'must' ? 'should' : f.priority === 'should' ? 'could' : 'must' } : f)))
  return (
    <div className="card plan">
      <div className="card-h"><strong>{ko ? `참고 앱 분석: ${pipeline?.reference?.name}` : `Recon: ${pipeline?.reference?.name}`}</strong><span className="muted" style={{ fontSize: 11 }}>{ko ? '규모' : 'size'} {recon.size}</span></div>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{recon.coreLoop}</p>
      <div className="plan-body"><div className="cols">
        <div><b>{ko ? '화면' : 'Screens'}</b><ul>{recon.screens.map((s) => <li key={s.id}>{s.name} <span className="muted">— {s.purpose}</span></li>)}</ul></div>
        <div><b>{ko ? '흐름' : 'Flows'}</b><ul>{recon.flows.map((f) => <li key={f.goal}>{f.goal} <span className="muted">({f.steps.length}{ko ? '단계' : ' steps'})</span></li>)}</ul></div>
      </div></div>
      <div><b style={{ fontSize: 12 }}>{ko ? '기능 (클릭해서 우선순위 변경)' : 'Features (click to change priority)'}</b>
        <div className="tasks" style={{ marginTop: 4 }}>{features.map((f, i) => <span key={i} className={'task ' + (f.priority === 'must' ? 'running' : f.priority === 'should' ? '' : 'skipped')} style={{ cursor: 'pointer' }} onClick={() => cycle(i)}>{f.priority} · {f.name}</span>)}</div></div>
      {recon.complaints.length > 0 && <div><b style={{ fontSize: 12 }}>{ko ? '리뷰에서 본 불만' : 'Complaints from reviews'}</b><ul className="muted" style={{ fontSize: 12, margin: '4px 0 0', paddingLeft: 16 }}>{recon.complaints.map((c) => <li key={c.theme}>{c.theme} ({c.count}){c.quote ? <> — “{c.quote}”</> : null}</li>)}</ul></div>}
      <div><b style={{ fontSize: 12 }}>{ko ? '우리의 차별점' : 'Our angle'}</b><textarea rows={2} value={angle} onChange={(e) => setAngle(e.target.value)} /></div>
      {recon.cannotClone.length > 0 && <div className="muted" style={{ fontSize: 11 }}>{ko ? '가져오지 않는 것: ' : 'Not cloned: '}{recon.cannotClone.join(' · ')}</div>}
      <div className="card-f"><button onClick={() => void cancelPipeline()}>{ko ? '취소' : 'Cancel'}</button><button className="primary" onClick={() => void approvePipeline({ recon: { ...recon, features, angle } })}>{ko ? '좋아요, 기획으로' : 'Approve, plan it'}</button></div>
    </div>
  )
}

function UndoMenu() {
  const { snapshots, refreshSnapshots, restoreSnapshot, settings, pipeline } = useStore(); const ko = (settings?.language ?? 'ko') === 'ko'
  const [open, setOpen] = useState(false)
  useEffect(() => { if (open) void refreshSnapshots() }, [open, refreshSnapshots])
  if (snapshots.length === 0 && !open) return <button className="ghost sm" onClick={() => setOpen(true)}><Undo2 size={12} /></button>
  return (
    <div className="undo">
      <button className="ghost sm" onClick={() => setOpen(!open)}><Undo2 size={12} /> {ko ? '되돌리기' : 'Undo'}</button>
      {open && <div className="undo-list">{snapshots.length === 0 && <div className="muted">{ko ? '아직 저장된 시점이 없습니다' : 'No snapshots yet'}</div>}{snapshots.slice(0, 15).map((s) => <div key={s.sha} className="undo-item" onClick={() => { if (!pipeline?.running && confirm(ko ? `"${s.label}" 시점으로 되돌릴까요? 이후 변경은 사라집니다.` : `Restore "${s.label}"? Later changes will be lost.`)) { void restoreSnapshot(s.sha); setOpen(false) } }}><span>{s.label}</span><span className="muted">{new Date(s.at).toLocaleTimeString()}</span></div>)}</div>}
    </div>
  )
}

export default function Pipeline() {
  const { pipeline: p, activities, settings, setView, approvePipeline } = useStore()
  const ko = (settings?.language ?? 'ko') === 'ko'
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [activities, p?.awaiting])
  return (
    <div className="pipe">
      <ProgressMap />
      <div className="msgs">
        {activities.length === 0 && !p && <div className="muted" style={{ padding: 10, lineHeight: 1.7 }}>{ko ? '만들고 싶은 걸 말하면 기획 → 설계 → 구현 → QA(빌드 검사) → 배포까지 진행합니다. 각 단계가 지금 뭘 하는지 여기에 쉬운 말로 표시되고, 언제든 멈추거나 되돌릴 수 있습니다.' : 'Describe what you want. It goes plan → design → build → QA → deploy, explained in plain language here. Stop or undo any time.'}</div>}
        {activities.map((a) => (
          <div key={a.id} className={'act ' + a.kind}>{ICON[a.kind]}<div className="t">{a.text}{a.image && <img className="shot" src={a.image} alt="" />}{a.detail && <details><summary>{ko ? '자세히' : 'details'}</summary><pre>{a.detail}</pre></details>}</div></div>
        ))}
        {p?.awaiting === 'approve-recon' && p.recon && <ReconCard key={p.id + 'recon'} recon={p.recon} />}
        {p?.awaiting === 'approve-plan' && p.plan && <PlanCard key={p.id + 'plan'} plan={p.plan} />}
        {p?.awaiting === 'approve-blueprint' && p.blueprint && <BlueprintCard key={p.id + 'bp'} bp={p.blueprint} />}
        {p?.awaiting === 'vercel-setup' && <div className="card"><div className="card-h"><Rocket size={14} /> <strong>{ko ? 'Vercel 연결 필요' : 'Connect Vercel'}</strong></div><p className="muted">{ko ? '배포 탭에서 로그인과 프로젝트 링크(1~2단계)를 마친 뒤 계속을 누르세요. DB가 필요하면 3단계도.' : 'Finish steps 1-2 (and 3 for a DB) in the Deploy tab, then continue.'}</p><div className="card-f"><button onClick={() => setView('deploy')}>{ko ? '배포 탭 열기' : 'Open Deploy tab'}</button><button className="primary" onClick={() => void approvePipeline()}><Play size={11} /> {ko ? '계속' : 'Continue'}</button></div></div>}
        {p?.qa && p.stage === 'done' && <div className={'card ' + (p.qa.ok ? 'okb' : 'errb')}><div className="card-h"><strong>QA</strong><span className="muted" style={{ fontSize: 11 }}>{p.qa.checks.map((c) => `${c.name} ${c.ok ? '✓' : '✕'}`).join(' · ') || (ko ? '검사 항목 없음' : 'no checks')}</span></div>{!p.qa.ok && <pre className="muted" style={{ fontSize: 11, maxHeight: 160, overflow: 'auto' }}>{p.qa.checks.filter((c) => !c.ok).map((c) => c.output.slice(-800)).join('\n')}</pre>}{p.parity && <div style={{ fontSize: 12 }}>{ko ? '참고 앱 기능 커버리지' : 'Feature parity'}: <b>{p.parity.percent}%</b> ({p.parity.done}/{p.parity.total}){p.parity.missing.length > 0 && <span className="muted"> · {ko ? '남은 것' : 'missing'}: {p.parity.missing.slice(0, 5).map((m) => m.name).join(', ')}</span>}</div>}{p.brandHits && <div style={{ fontSize: 12 }} className={p.brandHits.length ? 'err' : ''}>{ko ? '브랜드 검사' : 'Brand sweep'}: {p.brandHits.length ? `${p.brandHits.length} ${ko ? '곳 남음' : 'leftovers'}` : (ko ? '깨끗함' : 'clean')}</div>}</div>}
        <div ref={endRef} />
      </div>
      <div className="pipe-foot"><UndoMenu /></div>
    </div>
  )
}
