import { useEffect, useState } from 'react'
import { FolderOpen, Shuffle, Cpu, X } from 'lucide-react'
import { useStore } from './store'
import MainArea from './components/MainArea'
import StartScreen from './components/StartScreen'
import ChatPanel from './components/ChatPanel'
import StatusBar from './components/StatusBar'
import QuickOpen from './components/QuickOpen'
import { SettingsModal, PlansModal, LedgerModal } from './components/Modals'
import { t } from './lib/i18n'

export default function App() {
  const { init, settings, modal, openFolder, setSettings, projectRoot, closeProject } = useStore()
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
        {projectRoot && <><button className="ghost sm" onClick={() => void openFolder()}><FolderOpen size={13} /> {projectRoot.split(/[\\/]/).pop()}</button><button className="ghost sm" title={t(lang, 'closeProject')} onClick={closeProject}><X size={12} /></button></>}
        <span className="spacer" />
        <span className={'pill ' + (settings?.routeMode === 'privacy-lock' ? 'privacy' : 'local')} title="⌘/">{settings?.byokEnabled ? <Shuffle size={11} /> : <Cpu size={11} />} {settings?.byokEnabled ? settings.routeMode : settings?.routeMode === 'privacy-lock' ? 'privacy lock' : '100% local'}</span>
      </div>
      {projectRoot ? <div className="main vibe"><ChatPanel /><MainArea /></div> : <div style={{ minHeight: 0, overflow: 'auto' }}><StartScreen /></div>}
      <StatusBar />
      {quick && <QuickOpen onClose={() => setQuick(false)} />}
      {modal === 'settings' && <SettingsModal />}
      {modal === 'plans' && <PlansModal />}
      {modal === 'ledger' && <LedgerModal />}
    </div>
  )
}
