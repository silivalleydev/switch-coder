import { Cpu, Settings, CreditCard, BookOpen, Play, Square } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../lib/i18n'

export default function StatusBar() {
  const { llama, settings, setModal, tabs, active } = useStore()
  const lang = settings?.language ?? 'ko'
  const tab = tabs.find((x) => x.path === active)
  const label = llama.state === 'running' ? t(lang, 'modelRunning') : llama.state === 'starting' ? t(lang, 'modelStarting') : llama.state === 'error' ? t(lang, 'modelError') : t(lang, 'modelStopped')
  return (
    <div className="statusbar">
      <span className="item" title={llama.message}><span className={'led ' + llama.state} /><Cpu size={11} /> {label}{llama.message && llama.state !== 'running' && <span className="muted"> · {llama.message.slice(0, 80)}</span>}</span>
      {llama.state === 'running' || llama.state === 'starting' ? <span className="item click" onClick={() => void window.sc.llama.stop()}><Square size={10} /> {t(lang, 'stopModel')}</span> : <span className="item click" onClick={() => void window.sc.llama.start()}><Play size={10} /> {t(lang, 'startModel')}</span>}
      <span className="spacer" />
      {tab && <span className="item">{tab.language}</span>}
      <span className="item click" onClick={() => setModal('ledger')}><BookOpen size={11} /> {t(lang, 'ledger')}</span>
      <span className="item click" onClick={() => setModal('plans')}><CreditCard size={11} /> {(settings?.plan ?? 'free').toUpperCase()}</span>
      <span className="item click" onClick={() => setModal('settings')}><Settings size={11} /> {t(lang, 'settings')}</span>
    </div>
  )
}
