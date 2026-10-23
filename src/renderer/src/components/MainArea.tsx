import { useEffect, useRef, useState } from 'react'
import { Eye, Code2, TerminalSquare, RefreshCw, ExternalLink, Square, Play } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../lib/i18n'
import FileTree from './FileTree'
import EditorPane from './EditorPane'
import type { ProcInfo } from '../../../shared/types'

function Preview() {
  const { previewUrl, settings, setPreviewUrl } = useStore()
  const lang = settings?.language ?? 'ko'
  const [url, setUrl] = useState(previewUrl ?? '')
  const [nonce, setNonce] = useState(0)
  useEffect(() => { setUrl(previewUrl ?? '') }, [previewUrl])
  return (
    <div className="preview">
      <div className="bar"><input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setPreviewUrl(url) }} placeholder="http://localhost:5173" /><button className="ghost sm" onClick={() => setNonce((n) => n + 1)}><RefreshCw size={13} /></button><button className="ghost sm" onClick={() => previewUrl && void window.sc.openExternal(previewUrl)}><ExternalLink size={13} /></button></div>
      {previewUrl ? <iframe key={nonce} src={previewUrl} title="preview" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" /> : <div className="welcome"><div className="muted">{t(lang, 'noPreview')}</div></div>}
    </div>
  )
}

function Terminal() {
  const { terminal, projectRoot } = useStore()
  const [cmd, setCmd] = useState('')
  const [procs, setProcs] = useState<ProcInfo[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [terminal])
  useEffect(() => { const h = setInterval(() => void window.sc.proc.list().then(setProcs), 2000); return () => clearInterval(h) }, [])
  const run = async (background = false) => { if (!cmd.trim() || !projectRoot) return; const c = cmd; setCmd(''); useStore.setState((st) => ({ terminal: st.terminal + `$ ${c}\n` })); try { await window.sc.proc.run({ root: projectRoot, command: c, background }) } catch (e) { useStore.setState((st) => ({ terminal: st.terminal + String(e) + '\n' })) } }
  return (
    <div className="terminal">
      {procs.filter((p) => p.running).length > 0 && <div className="procs">{procs.filter((p) => p.running).map((p) => <span key={p.id} className="pill local"><Play size={10} /> {p.command}{p.url ? ` · ${p.url}` : ''} <span className="x" onClick={() => void window.sc.proc.stop(p.id)}><Square size={10} /></span></span>)}</div>}
      <pre>{terminal || '—'}<div ref={endRef} /></pre>
      <div className="bar"><span className="muted">$</span><input value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run(e.shiftKey) }} placeholder="npm run dev  (Shift+Enter = background)" /></div>
    </div>
  )
}

export default function MainArea() {
  const { view, setView, settings, previewUrl } = useStore()
  const lang = settings?.language ?? 'ko'
  return (
    <div className="mainarea">
      <div className="viewtabs">
        <button className={view === 'preview' ? 'on' : ''} onClick={() => setView('preview')}><Eye size={13} /> {t(lang, 'preview')}{previewUrl && <span className="led running" />}</button>
        <button className={view === 'code' ? 'on' : ''} onClick={() => setView('code')}><Code2 size={13} /> {t(lang, 'code')}</button>
        <button className={view === 'terminal' ? 'on' : ''} onClick={() => setView('terminal')}><TerminalSquare size={13} /> {t(lang, 'terminal')}</button>
      </div>
      <div className="viewbody">
        {view === 'preview' && <Preview />}
        {view === 'code' && <div className="codeview"><FileTree /><EditorPane /></div>}
        {view === 'terminal' && <Terminal />}
      </div>
    </div>
  )
}
