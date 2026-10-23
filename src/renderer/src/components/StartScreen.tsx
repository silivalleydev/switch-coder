import { useState } from 'react'
import { FolderOpen, Sparkles, Clock, Cpu } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../lib/i18n'
import type { TemplateId } from '../../../shared/types'
import wordmark from '../assets/wordmark.png'

const TEMPLATES: { id: TemplateId; name: string; desc: { ko: string; en: string } }[] = [
  { id: 'vite-react', name: 'Vite + React', desc: { ko: '웹 앱 기본. 가장 빠르고 Flint가 가장 잘 다룸', en: 'Default for web apps. Fastest; Flint handles it best' } },
  { id: 'next', name: 'Next.js', desc: { ko: '풀스택 웹 (App Router, Tailwind)', en: 'Full-stack web (App Router, Tailwind)' } },
  { id: 'expo', name: 'Expo (RN)', desc: { ko: 'iOS/Android 앱, 웹 프리뷰 지원', en: 'iOS/Android app with web preview' } },
  { id: 'python', name: 'Python', desc: { ko: '스크립트·CLI·데이터 작업', en: 'Scripts, CLIs, data work' } },
  { id: 'empty', name: '빈 폴더', desc: { ko: '에이전트가 스택을 고르게 둠', en: 'Let the agent pick the stack' } },
]

export default function StartScreen() {
  const { settings, openFolder, recents, createProject, creating, llama, terminal } = useStore()
  const lang = settings?.language ?? 'ko'
  const [name, setName] = useState('')
  const [template, setTemplate] = useState<TemplateId>('vite-react')
  const [parent, setParent] = useState<string>(() => localStorage.getItem('projectsDir') ?? '')
  const [prompt, setPrompt] = useState('')
  const pick = async () => { const p = await window.sc.project.pickParent(); if (p) { setParent(p); localStorage.setItem('projectsDir', p) } }
  const create = async () => { if (!parent) { await pick(); if (!localStorage.getItem('projectsDir')) return } const par = parent || localStorage.getItem('projectsDir') || ''; if (!par || !name.trim()) return; await createProject(par, name, template, prompt) }
  return (
    <div className="start">
      <div className="start-hero"><img className="wordmark" src={wordmark} alt="SwitchCoder" /><div className="muted">{t(lang, 'startTagline')}</div>
        <div className="pill local" style={{ marginTop: 6 }}><Cpu size={11} /> {llama.state === 'running' ? t(lang, 'modelRunning') : llama.state === 'starting' ? t(lang, 'modelStarting') : llama.state === 'error' ? t(lang, 'modelError') : t(lang, 'modelStopped')}</div></div>
      <div className="start-cols">
        <div className="start-card">
          <h2><FolderOpen size={16} /> {t(lang, 'openProject')}</h2>
          <button className="primary" onClick={() => void openFolder()}>{t(lang, 'openFolder')}</button>
          {recents.length > 0 && <><h3><Clock size={12} /> {t(lang, 'recent')}</h3><div className="recents">{recents.map((r) => <div key={r} className="recent" onClick={() => void openFolder(r)}><strong>{r.split(/[\\/]/).pop()}</strong><span className="muted">{r}</span></div>)}</div></>}
        </div>
        <div className="start-card">
          <h2><Sparkles size={16} /> {t(lang, 'newProject')}</h2>
          <div className="form">
            <label>{t(lang, 'projectName')}</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-app" autoFocus />
            <label>{t(lang, 'template')}</label>
            <div className="tpl">{TEMPLATES.map((x) => <div key={x.id} className={'tpl-item' + (template === x.id ? ' on' : '')} onClick={() => setTemplate(x.id)}><strong>{x.name}</strong><span>{x.desc[lang]}</span></div>)}</div>
            <label>{t(lang, 'location')}</label><div style={{ display: 'flex', gap: 6 }}><input style={{ flex: 1 }} value={parent} readOnly placeholder="~/workspace" onClick={() => void pick()} /><button onClick={() => void pick()}>…</button></div>
            <label>{t(lang, 'firstPrompt')}</label><textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={lang === 'ko' ? '예: 할 일 앱. 추가/완료/삭제, 로컬스토리지 저장, 다크 테마' : 'e.g. Todo app with add/complete/delete, localStorage, dark theme'} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}><button className="primary" disabled={creating || !name.trim()} onClick={() => void create()}>{creating ? t(lang, 'creating') : t(lang, 'create')}</button></div>
          {creating && <pre className="mini-term">{terminal.slice(-1500)}</pre>}
        </div>
      </div>
    </div>
  )
}
