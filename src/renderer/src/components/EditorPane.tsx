import { useEffect, useRef, useState } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../lib/i18n'
import InlineEdit from './InlineEdit'

export default function EditorPane() {
  const { tabs, active, setActive, closeTab, updateContent, saveActive, setSelection, settings, llama } = useStore()
  const lang = settings?.language ?? 'ko'
  const tab = tabs.find((x) => x.path === active)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const [inline, setInline] = useState<{ text: string; range: Monaco.IRange } | null>(null)

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void useStore.getState().saveActive())
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      const sel = editor.getSelection(); const model = editor.getModel(); if (!sel || !model) return
      const text = model.getValueInRange(sel) || model.getLineContent(sel.startLineNumber)
      setInline({ text, range: sel })
    })
    editor.onDidChangeCursorSelection((e) => {
      const model = editor.getModel(); if (!model) return
      const text = model.getValueInRange(e.selection)
      const st = useStore.getState()
      if (text.trim().length > 0 && st.active) setSelection({ text, path: st.active, startLine: e.selection.startLineNumber, endLine: e.selection.endLineNumber })
      else setSelection(null)
    })
  }
  useEffect(() => { setInline(null); setSelection(null) }, [active, setSelection])

  const applyInline = (newText: string) => {
    const ed = editorRef.current; if (!ed || !inline) return
    ed.executeEdits('switchcoder', [{ range: inline.range, text: newText }])
    setInline(null)
  }

  return (
    <div className="editor">
      <div className="tabs">
        {tabs.map((x) => (
          <div key={x.path} className={'tab' + (x.path === active ? ' active' : '')} onClick={() => setActive(x.path)}>
            {x.content !== x.saved && <span className="dirty" title={t(lang, 'unsaved')} />}<span>{x.name}</span>
            <span className="x" onClick={(e) => { e.stopPropagation(); closeTab(x.path) }}><X size={12} /></span>
          </div>
        ))}
      </div>
      <div className="editor-body">
        {tab ? (
          <>
            <Editor key={tab.path} path={tab.path} language={tab.language} value={tab.content} theme="vs-dark" onMount={onMount}
              onChange={(v) => updateContent(tab.path, v ?? '')}
              options={{ fontSize: 13, fontFamily: 'ui-monospace, SF Mono, Menlo, Consolas, monospace', minimap: { enabled: false }, smoothScrolling: true, cursorBlinking: 'smooth', renderLineHighlight: 'all', padding: { top: 10 }, scrollBeyondLastLine: false, tabSize: 2, automaticLayout: true }} />
            {inline && <InlineEdit selection={inline.text} onApply={applyInline} onClose={() => setInline(null)} />}
          </>
        ) : (
          <div className="welcome">
            <h1>{t(lang, 'welcome')}</h1>
            <div>{t(lang, 'welcomeSub')}</div>
            <div className="kbd-row"><span><kbd>⌘O</kbd> {t(lang, 'openFolder')}</span><span><kbd>⌘P</kbd> Quick open</span><span><kbd>⌘K</kbd> {t(lang, 'inlineEdit')}</span><span><kbd>⌘/</kbd> Local ⇄ Cloud</span></div>
            {llama.state !== 'running' && <div className="muted" style={{ marginTop: 14 }}>{llama.state === 'error' ? llama.message : t(lang, 'modelStopped')}</div>}
          </div>
        )}
        <button className="ghost sm" style={{ position: 'absolute', right: 10, bottom: 10, opacity: 0 }} onClick={() => void saveActive()} tabIndex={-1} aria-hidden />
      </div>
    </div>
  )
}
