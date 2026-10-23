import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Square, Trash2, ListChecks, Cpu, Cloud, Lock, Shuffle, Hammer, MessageSquare, FileText, Terminal as TermIcon, FolderTree, CheckCircle2 } from 'lucide-react'
import { useStore, rel, findFile, type UiMessage, type AgentItem } from '../store'
import { t } from '../lib/i18n'
import { parseBlocks, safeJsonArray } from '../lib/code'
import Pipeline from './Pipeline'
import type { RouteDecision, RouteMode } from '../../../shared/types'

function CodeBlock({ lang, path, code }: { lang: string; path: string | null; code: string }) {
  const { projectRoot, writeAndOpen, tabs, active, updateContent, settings, tree } = useStore()
  const l = settings?.language ?? 'ko'
  const [done, setDone] = useState(false)
  const apply = async () => {
    if (path) {
      const node = findFile(tree, path)
      const abs = node?.path ?? (projectRoot ? `${projectRoot}/${path.replace(/^\.?\//, '')}` : null)
      if (abs) { await writeAndOpen(abs, code + '\n'); setDone(true); return }
    }
    const tab = tabs.find((x) => x.path === active)
    if (tab) { updateContent(tab.path, code + '\n'); setDone(true) }
  }
  const target = path ? rel(projectRoot, path) : tabs.find((x) => x.path === active)?.name
  return (
    <div className="codeblock">
      <div className="bar"><span>{lang || 'code'}</span>{target && <span className="muted">→ {target}</span>}<span className="spacer" /><button className="sm ghost" onClick={() => void navigator.clipboard.writeText(code)}>{t(l, 'copy')}</button>{(path || active) && <button className="sm" onClick={() => void apply()}>{done ? t(l, 'applied') : t(l, 'apply')}</button>}</div>
      <pre>{code}</pre>
    </div>
  )
}

function Rich({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: (string | { b: ReturnType<typeof parseBlocks>[number] })[] = []
    let last = 0
    for (const m of text.matchAll(/```[\w+-]*[^\n]*\n[\s\S]*?```/g)) { out.push(text.slice(last, m.index)); const b = parseBlocks(m[0])[0]; if (b) out.push({ b }); last = (m.index ?? 0) + m[0].length }
    out.push(text.slice(last))
    return out
  }, [text])
  return <>{parts.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <CodeBlock key={i} {...p.b} />))}</>
}

function Decision({ d, target }: { d?: RouteDecision; target?: UiMessage['target'] }) {
  if (!d || !target) return null
  const cls = target.kind === 'local' ? 'local' : 'cloud'
  return <div className="meta"><span className={'pill ' + cls}>{target.kind === 'local' ? <Cpu size={11} /> : <Cloud size={11} />} {target.label}</span><span title={d.reasons.join(', ')}>{d.score}/100 · {d.reasons[0]}</span></div>
}

function ToolCard({ it }: { it: Extract<AgentItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false)
  const icon = it.name === 'write_file' ? <FileText size={12} /> : it.name === 'run_command' ? <TermIcon size={12} /> : it.name === 'list_files' ? <FolderTree size={12} /> : it.name === 'finish' ? <CheckCircle2 size={12} /> : <FileText size={12} />
  const arg = it.name === 'run_command' ? String(it.args.command ?? '') : String(it.args.path ?? it.args.summary ?? '')
  return (
    <div className="tool">
      <div className="head" onClick={() => setOpen(!open)}>{icon}<span className="name">{it.name}</span><span className="arg">{arg}</span><span className={'st ' + (it.ok === undefined ? '' : it.ok ? 'ok' : 'fail')} /></div>
      {open && <pre>{it.name === 'write_file' ? String(it.args.content ?? '') + '\n\n' : ''}{it.output ?? '…'}</pre>}
    </div>
  )
}

function AgentTimeline() {
  const { agentItems, settings, agentRunning } = useStore()
  const lang = settings?.language ?? 'ko'
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [agentItems])
  return (
    <div className="msgs">
      {agentItems.length === 0 && <div className="muted" style={{ padding: 10, lineHeight: 1.6 }}>{t(lang, 'agentIdle')}</div>}
      {agentItems.map((it) => {
        if (it.kind === 'tool') return <ToolCard key={it.id} it={it} />
        if (it.kind === 'reasoning') return <details key={it.id} className="thinking"><summary>reasoning</summary><div>{it.text}</div></details>
        if (it.kind === 'done') return <div key={it.id} className="agent-item done">✓ {it.text}<div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{it.iterations} steps</div></div>
        return <div key={it.id} className={'agent-item ' + it.kind}>{it.text}</div>
      })}
      {agentRunning && <div className="muted" style={{ fontSize: 12 }}>▍ working…</div>}
      <div ref={endRef} />
    </div>
  )
}

export default function ChatPanel() {
  const { messages, send, cancel, clearChat, settings, setSettings, steps, setSteps, llama, tabs, active, tree, chatMode, setChatMode, cancelAgent, clearAgent, agentRunning, startPipeline, pipeline, pipeMode, setPipeMode, wantDeploy, setWantDeploy, clearActivities, cancelPipeline, reference, setReference } = useStore()
  const [refOpen, setRefOpen] = useState(false)
  const lang = settings?.language ?? 'ko'
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<RouteDecision | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const streaming = messages.some((m) => m.streaming)
  const mode: RouteMode = settings?.routeMode ?? 'auto'
  const byok = settings?.byokEnabled ?? false

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages])
  useEffect(() => {
    if (!text.trim()) { setPreview(null); return }
    const h = setTimeout(() => { const n = (text.match(/@[\w./\\-]+/g)?.length ?? 0) + (active ? 1 : 0); void window.sc.chat.route([{ role: 'user', content: text }], n).then(setPreview) }, 250)
    return () => clearTimeout(h)
  }, [text, active])

  // Step planner: when the last assistant message was a plan, parse it into steps.
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant' || last.streaming || !last.content.trim().startsWith('[')) return
    const arr = safeJsonArray<{ title: string; detail: string; files?: string[] }>(last.content)
    if (arr) setSteps(arr.map((s) => ({ title: s.title, detail: s.detail, files: s.files ?? [], status: 'todo' })))
  }, [messages, setSteps])

  const submit = (opts?: { mode?: 'chat' | 'plan'; forceTarget?: 'local' | 'cloud' }) => { if (!text.trim()) return; if (chatMode === 'build') { if (pipeline?.running || agentRunning) return; void startPipeline(text); setText(''); return } if (streaming) return; void send(text, opts); setText('') }
  const runStep = (i: number) => {
    const s = steps[i]
    setSteps(steps.map((x, j) => (j === i ? { ...x, status: 'running' } : x)))
    const files = s.files.map((f) => (findFile(tree, f) ? `@${f}` : '')).filter(Boolean).join(' ')
    void send(`${files} Step ${i + 1}/${steps.length}: ${s.title}\n${s.detail}`.trim(), { forceTarget: 'local' }).then(() => setSteps(useStore.getState().steps.map((x, j) => (j === i ? { ...x, status: 'done' } : x))))
  }
  const setMode = (m: RouteMode) => void setSettings({ routeMode: m })

  return (
    <div className="chat">
      <div className="head">
        <div className="seg"><button className={chatMode === 'build' ? 'on' : ''} onClick={() => setChatMode('build')}><Hammer size={11} /> {t(lang, 'build')}</button><button className={chatMode === 'chat' ? 'on' : ''} onClick={() => setChatMode('chat')}><MessageSquare size={11} /> {t(lang, 'chatOnly')}</button></div>
        <span className="spacer" style={{ flex: 1 }} />
        <div className="seg" title="⌘/">
          {byok && <button className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')}><Shuffle size={11} /> {t(lang, 'auto')}</button>}
          <button className={'local' + (mode === 'local' || (!byok && mode !== 'privacy-lock') ? ' on' : '')} onClick={() => setMode('local')}><Cpu size={11} /> {t(lang, 'local')}</button>
          {byok && <button className={'cloud' + (mode === 'cloud' ? ' on' : '')} onClick={() => setMode('cloud')}><Cloud size={11} /> {t(lang, 'cloud')}</button>}
          <button className={'privacy' + (mode === 'privacy-lock' ? ' on' : '')} onClick={() => setMode('privacy-lock')} title={t(lang, 'privacy')}><Lock size={11} /></button>
        </div>
        <button className="ghost sm" onClick={() => (chatMode === 'build' ? (clearActivities(), void clearAgent()) : clearChat())} title="Clear"><Trash2 size={13} /></button>
      </div>
      {chatMode === 'build' ? <Pipeline /> : <div className="msgs">
        {messages.length === 0 && <div className="muted" style={{ padding: 10, lineHeight: 1.6 }}>{t(lang, 'emptyChat')}<br /><br />{t(lang, 'planHint')}</div>}
        {messages.map((m) => (
          <div key={m.id} className={'msg ' + m.role}>
            {m.role === 'assistant' && <Decision d={m.decision} target={m.target} />}
            {m.reasoning && <details className="thinking" open={m.streaming && !m.content}><summary>{m.streaming && !m.content ? '생각 중…' : 'reasoning'}</summary><div>{m.reasoning}</div></details>}
            {m.role === 'assistant' ? <Rich text={m.content} /> : m.content}
            {m.streaming && <span className="muted"> ▍</span>}
            {m.error && <div className="err">{m.error}</div>}
          </div>
        ))}
        <div ref={endRef} />
      </div>}
      {chatMode === 'chat' && steps.length > 0 && (
        <div className="steps">
          <div className="hint"><ListChecks size={12} /> {t(lang, 'plan')} · {steps.filter((s) => s.status === 'done').length}/{steps.length}</div>
          {steps.map((s, i) => (
            <div key={i} className={'step ' + s.status}><div className="n">{s.status === 'done' ? '✓' : i + 1}</div><div className="body"><div className="t">{s.title}</div><div className="d">{s.detail}</div>{s.files.length > 0 && <div className="f">{s.files.join(', ')}</div>}</div>{s.status !== 'done' && <button className="sm" disabled={streaming} onClick={() => runStep(i)}>{t(lang, 'runStep')}</button>}</div>
          ))}
        </div>
      )}
      <div className="composer">
        {chatMode === 'build' && <div className="pipe-opts"><span>{lang === 'ko' ? '방식' : 'Mode'}</span><div className="seg"><button className={pipeMode === 'auto' ? 'on' : ''} onClick={() => setPipeMode('auto')}>{lang === 'ko' ? '자동' : 'Auto'}</button><button className={pipeMode === 'full' ? 'on' : ''} onClick={() => setPipeMode('full')}>{lang === 'ko' ? '기획부터' : 'Full'}</button><button className={pipeMode === 'quick' ? 'on' : ''} onClick={() => setPipeMode('quick')}>{lang === 'ko' ? '바로 수정' : 'Quick'}</button></div><label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><input type="checkbox" checked={wantDeploy} onChange={(e) => setWantDeploy(e.target.checked)} /> {lang === 'ko' ? '끝나면 배포까지' : 'Deploy when done'}</label><button className={'ghost sm' + (reference.name ? ' on' : '')} style={reference.name ? { color: 'var(--accent)' } : undefined} onClick={() => setRefOpen(!refOpen)}>{lang === 'ko' ? (reference.name ? `참고: ${reference.name}` : '참고 앱…') : (reference.name ? `Ref: ${reference.name}` : 'Reference app…')}</button></div>}
        {chatMode === 'build' && refOpen && (
          <div className="refbox">
            <div className="muted" style={{ fontSize: 11, lineHeight: 1.5 }}>{lang === 'ko' ? '"X 같은 앱"을 만들 때 X의 기능과 흐름만 참고합니다. 코드·로고·문구·이름은 가져오지 않고, 끝나면 참고 앱 이름이 남았는지 검사합니다. 공개 정보만 봅니다.' : 'For "an app like X": we study X\'s features and flows only. No code, logo, copy or name is copied, and we sweep for leftovers at the end. Public info only.'}</div>
            <div className="row"><input placeholder={lang === 'ko' ? '참고 앱 이름 (예: Todoist)' : 'Reference app name'} value={reference.name} onChange={(e) => setReference({ name: e.target.value })} /><input placeholder="URL (선택)" value={reference.url ?? ''} onChange={(e) => setReference({ url: e.target.value })} /><input style={{ width: 120 }} placeholder={lang === 'ko' ? 'App Store ID (선택)' : 'App Store ID'} value={reference.appStoreId ?? ''} onChange={(e) => setReference({ appStoreId: e.target.value })} /></div>
            <textarea rows={2} placeholder={lang === 'ko' ? '내가 아는 점·마음에 드는 점·싫은 점 (선택)' : 'What you know / like / dislike (optional)'} value={reference.notes ?? ''} onChange={(e) => setReference({ notes: e.target.value })} />
            <textarea rows={2} placeholder={lang === 'ko' ? '사용자 리뷰 붙여넣기 (선택) — 불만 분석과 차별점에 씁니다. 지어내지 않습니다.' : 'Paste user reviews (optional) — used for complaints & angle; never invented.'} value={reference.reviews ?? ''} onChange={(e) => setReference({ reviews: e.target.value })} />
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="ghost sm" onClick={() => { setReference({ name: '', url: '', notes: '', reviews: '', appStoreId: '' }); setRefOpen(false) }}>{lang === 'ko' ? '지우기' : 'Clear'}</button><button className="sm" onClick={() => setRefOpen(false)}>{lang === 'ko' ? '닫기' : 'Close'}</button></div>
          </div>
        )}
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={chatMode === 'build' ? t(lang, 'buildPlaceholder') : t(lang, 'placeholder')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }} />
        <div className="row">
          {preview && byok && <span className="route-preview">{t(lang, 'routeTo')}: <span className={'pill ' + preview.target}>{preview.target === 'local' ? 'Flint' : t(lang, 'cloud')}</span> {preview.score}/100 <span className="muted">· {preview.reasons[0]}</span></span>}
          <span className="spacer" />
          {active && <span className="muted" style={{ fontSize: 11 }}>@ {tabs.find((x) => x.path === active)?.name}</span>}
          {chatMode === 'chat' && <button className="sm" title={t(lang, 'planHint')} disabled={streaming || !text.trim()} onClick={() => submit({ mode: 'plan' })}><ListChecks size={12} /> {t(lang, 'plan')}</button>}
          {chatMode === 'build'
            ? ((pipeline?.running || agentRunning) ? <button className="sm" onClick={() => { void cancelPipeline(); cancelAgent() }}><Square size={12} /> {t(lang, 'stop')}</button> : <button className="primary sm" disabled={!text.trim() || llama.state !== 'running' || !!pipeline?.awaiting?.startsWith('approve')} onClick={() => submit()}><Hammer size={12} /> {t(lang, 'build')}</button>)
            : (streaming ? <button className="sm" onClick={cancel}><Square size={12} /> {t(lang, 'stop')}</button> : <button className="primary sm" disabled={!text.trim() || (mode !== 'cloud' && llama.state !== 'running' && preview?.target !== 'cloud')} onClick={() => submit()}><Send size={12} /> {t(lang, 'send')}</button>)}
        </div>
      </div>
    </div>
  )
}
