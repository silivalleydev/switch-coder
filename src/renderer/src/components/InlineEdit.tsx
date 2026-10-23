import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { t } from '../lib/i18n'
import { extractCode } from '../lib/code'

/** Cmd+K: edit the selection with the local model (always local — selections are small and private). */
export default function InlineEdit({ selection, onApply, onClose }: { selection: string; onApply: (s: string) => void; onClose: () => void }) {
  const { settings, tabs, active } = useStore()
  const lang = settings?.language ?? 'ko'
  const [prompt, setPrompt] = useState('')
  const [out, setOut] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reqRef = useRef<string | null>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => window.sc.chat.onChunk((c) => {
    if (c.requestId !== reqRef.current) return
    if (c.delta) setOut((o) => (o ?? '') + c.delta)
    if (c.error && c.error !== 'cancelled') setErr(c.error)
    if (c.done) setBusy(false)
  }), [])

  const run = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true); setOut(''); setErr(null)
    const tab = tabs.find((x) => x.path === active)
    const messages = [{ role: 'user' as const, content: `Rewrite ONLY the following ${tab?.language ?? ''} code according to the instruction. Output just the replacement code in one fenced block, no explanation.\n\nInstruction: ${prompt}\n\nCode:\n\`\`\`\n${selection}\n\`\`\`` }]
    const r = await window.sc.chat.start({ messages, attachedFiles: [], projectRoot: null, forceTarget: 'local' })
    reqRef.current = r.requestId
  }
  const result = out != null ? extractCode(out) : ''
  return (
    <div className="inline-edit" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <div className="row"><strong style={{ fontSize: 12 }}>{t(lang, 'inlineEdit')}</strong><span className="pill local">Flint</span></div>
      <div className="row"><input ref={inputRef} style={{ flex: 1 }} placeholder={t(lang, 'inlinePlaceholder')} value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} /><button className="primary" disabled={busy} onClick={() => void run()}>{busy ? '…' : '↵'}</button></div>
      {err && <div className="err">{err}</div>}
      {out != null && <pre>{busy ? out : result || out}</pre>}
      {out != null && !busy && <div className="row" style={{ justifyContent: 'flex-end' }}><button onClick={onClose}>{t(lang, 'reject')}</button><button className="primary" onClick={() => onApply(result || out)}>{t(lang, 'accept')}</button></div>}
    </div>
  )
}
