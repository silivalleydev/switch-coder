import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, allFiles, rel } from '../store'

export default function QuickOpen({ onClose }: { onClose: () => void }) {
  const { tree, projectRoot, openFile } = useStore()
  const [q, setQ] = useState(''); const [sel, setSel] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const files = useMemo(() => allFiles(tree), [tree])
  const hits = useMemo(() => { const n = q.toLowerCase(); return (n ? files.filter((f) => rel(projectRoot, f.path).toLowerCase().includes(n)) : files).slice(0, 50) }, [files, q, projectRoot])
  const go = (i: number) => { const f = hits[i]; if (f) { void openFile(f.path); onClose() } }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setSel(0) }} placeholder="Quick open…" onKeyDown={(e) => { if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, hits.length - 1)); if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0)); if (e.key === 'Enter') go(sel); if (e.key === 'Escape') onClose() }} />
        <div className="list">{hits.map((f, i) => <div key={f.path} className={'item' + (i === sel ? ' sel' : '')} onClick={() => go(i)}><span>{f.name}</span><span className="p">{rel(projectRoot, f.path)}</span></div>)}</div>
      </div>
    </div>
  )
}
