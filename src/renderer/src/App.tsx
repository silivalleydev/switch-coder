import { useEffect, useState } from 'react'
import { FolderOpen, Shuffle, Cpu } from 'lucide-react'
import { useStore } from './store'
import FileTree from './components/FileTree'
import EditorPane from './components/EditorPane'
import ChatPanel from './components/ChatPanel'
import StatusBar from './components/StatusBar'
import QuickOpen from './components/QuickOpen'
import { SettingsModal, PlansModal, LedgerModal } from './components/Modals'
import { t } from './lib/i18n'

export default function App() {
  const { init, settings, modal, openFolder, setSettings, projectRoot } = useStore()
  const [quick, setQuick] = useState(false)
  useEffect(() => { void init().then(() => { if (useStore.getState().llama.state === 'stopped') void window.sc.llama.start() }) }, [init])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'p') { e.preventDefault(); setQuick(true) }
      if (mod && e.key === '/') { e.preventDefault(); const s = useStore.getState().settings; if (s) void setSettings({ routeMode: !s.byokEnabled ? (s.routeMode === 'privacy-lock' ? 'local' : 'privacy-lock') : s.routeMode === 'local' ? 'cloud' : s.routeMode === 'cloud' ? 'auto' : 'local' }) }
      if (mod && e.key === ',') { e.preventDefault(); useStore.getState().setModal('settings') }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [setSettings])
  const lang = settings?.language ?? 'ko'
  return (
    <div className="app">
      <div className="titlebar">
        <span className="brand"><span className="dot" />Switch Coder</span>
        <button className="ghost sm" onClick={() => void openFolder()}><FolderOpen size={13} /> {projectRoot ? projectRoot.split(/[\\/]/).pop() : t(lang, 'openFolder')}</button>
        <span className="spacer" />
        <span className={'pill ' + (settings?.routeMode === 'privacy-lock' ? 'privacy' : 'local')} title="⌘/">{settings?.byokEnabled ? <Shuffle size={11} /> : <Cpu size={11} />} {settings?.byokEnabled ? settings.routeMode : settings?.routeMode === 'privacy-lock' ? 'privacy lock' : '100% local'}</span>
      </div>
      <div className="main"><FileTree /><EditorPane /><ChatPanel /></div>
      <StatusBar />
      {quick && <QuickOpen onClose={() => setQuick(false)} />}
      {modal === 'settings' && <SettingsModal />}
      {modal === 'plans' && <PlansModal />}
      {modal === 'ledger' && <LedgerModal />}
    </div>
  )
}
