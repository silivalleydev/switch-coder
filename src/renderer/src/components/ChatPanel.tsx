import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Square, Trash2, ListChecks, Cpu, Cloud, Lock, Shuffle } from 'lucide-react'
import { useStore, rel, findFile, type UiMessage } from '../store'
import { t } from '../lib/i18n'
import { parseBlocks, safeJsonArray } from '../lib/code'
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

export default function ChatPanel() {
  const { messages, send, cancel, clearChat, settings, setSettings, steps, setSteps, llama, tabs, active, tree } = useStore()
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

  const submit = (opts?: { mode?: 'chat' | 'plan'; forceTarget?: 'local' | 'cloud' }) => { if (!text.trim() || streaming) return; void send(text, opts); setText('') }
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
        <span className="title">{t(lang, 'chat')}</span>
        <div className="seg" title="⌘/">
          {byok && <button className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')}><Shuffle size={11} /> {t(lang, 'auto')}</button>}
          <button className={'local' + (mode === 'local' || (!byok && mode !== 'privacy-lock') ? ' on' : '')} onClick={() => setMode('local')}><Cpu size={11} /> {t(lang, 'local')}</button>
          {byok && <button className={'cloud' + (mode === 'cloud' ? ' on' : '')} onClick={() => setMode('cloud')}><Cloud size={11} /> {t(lang, 'cloud')}</button>}
          <button className={'privacy' + (mode === 'privacy-lock' ? ' on' : '')} onClick={() => setMode('privacy-lock')} title={t(lang, 'privacy')}><Lock size={11} /></button>
        </div>
        <button className="ghost sm" onClick={clearChat} title="Clear"><Trash2 size={13} /></button>
      </div>
      <div className="msgs">
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
      </div>
      {steps.length > 0 && (
        <div className="steps">
          <div className="hint"><ListChecks size={12} /> {t(lang, 'plan')} · {steps.filter((s) => s.status === 'done').length}/{steps.length}</div>
          {steps.map((s, i) => (
            <div key={i} className={'step ' + s.status}><div className="n">{s.status === 'done' ? '✓' : i + 1}</div><div className="body"><div className="t">{s.title}</div><div className="d">{s.detail}</div>{s.files.length > 0 && <div className="f">{s.files.join(', ')}</div>}</div>{s.status !== 'done' && <button className="sm" disabled={streaming} onClick={() => runStep(i)}>{t(lang, 'runStep')}</button>}</div>
          ))}
        </div>
      )}
      <div className="composer">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t(lang, 'placeholder')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }} />
        <div className="row">
          {preview && byok && <span className="route-preview">{t(lang, 'routeTo')}: <span className={'pill ' + preview.target}>{preview.target === 'local' ? 'Flint' : t(lang, 'cloud')}</span> {preview.score}/100 <span className="muted">· {preview.reasons[0]}</span></span>}
          <span className="spacer" />
          {active && <span className="muted" style={{ fontSize: 11 }}>@ {tabs.find((x) => x.path === active)?.name}</span>}
          <button className="sm" title={t(lang, 'planHint')} disabled={streaming || !text.trim()} onClick={() => submit({ mode: 'plan' })}><ListChecks size={12} /> {t(lang, 'plan')}</button>
          {streaming ? <button className="sm" onClick={cancel}><Square size={12} /> {t(lang, 'stop')}</button> : <button className="primary sm" disabled={!text.trim() || (mode !== 'cloud' && llama.state !== 'running' && preview?.target !== 'cloud')} onClick={() => submit()}><Send size={12} /> {t(lang, 'send')}</button>}
        </div>
      </div>
    </div>
  )
}
