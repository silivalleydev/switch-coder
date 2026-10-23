import { create } from 'zustand'
import type { ChatMessage, FileNode, LocalServerStatus, RouteDecision, Settings, ModelTarget, LedgerEntry } from '../../shared/types'

export interface Tab { path: string; name: string; content: string; saved: string; language: string }
export interface UiMessage extends ChatMessage { id: string; reasoning?: string; target?: ModelTarget; decision?: RouteDecision; streaming?: boolean; error?: string }
export interface Step { title: string; detail: string; files: string[]; status: 'todo' | 'running' | 'done' }

export const langOf = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const m: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html', py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php', sh: 'shell', yml: 'yaml', yaml: 'yaml', toml: 'ini', sql: 'sql', xml: 'xml', dart: 'dart' }
  return m[ext] ?? 'plaintext'
}

interface State {
  settings: Settings | null
  projectRoot: string | null
  tree: FileNode | null
  tabs: Tab[]
  active: string | null
  messages: UiMessage[]
  steps: Step[]
  llama: LocalServerStatus
  ledger: LedgerEntry[]
  modal: null | 'settings' | 'plans' | 'ledger'
  selection: { text: string; path: string; startLine: number; endLine: number } | null
  init: () => Promise<void>
  openFolder: (p?: string) => Promise<void>
  refreshTree: () => Promise<void>
  openFile: (p: string) => Promise<void>
  closeTab: (p: string) => void
  setActive: (p: string) => void
  updateContent: (p: string, c: string) => void
  saveActive: () => Promise<void>
  writeAndOpen: (p: string, content: string) => Promise<void>
  setSettings: (s: Partial<Settings>) => Promise<void>
  setModal: (m: State['modal']) => void
  setSelection: (s: State['selection']) => void
  send: (text: string, opts?: { forceTarget?: 'local' | 'cloud'; mode?: 'chat' | 'plan' }) => Promise<void>
  cancel: () => void
  setSteps: (s: Step[]) => void
  clearChat: () => void
  refreshLedger: () => Promise<void>
}

let currentRequest: string | null = null

export const useStore = create<State>((set, get) => ({
  settings: null, projectRoot: null, tree: null, tabs: [], active: null, messages: [], steps: [], llama: { state: 'stopped' }, ledger: [], modal: null, selection: null,

  init: async () => {
    const settings = await window.sc.settings.get()
    const llama = await window.sc.llama.status()
    set({ settings, llama })
    window.sc.llama.onStatus((s) => set({ llama: s }))
    window.sc.chat.onChunk((c) => {
      if (c.requestId !== currentRequest) return
      set((st) => ({ messages: st.messages.map((m) => (m.id === c.requestId ? { ...m, content: m.content + (c.delta ?? ''), reasoning: (m.reasoning ?? '') + (c.reasoning ?? ''), streaming: !c.done, error: c.error && c.error !== 'cancelled' ? c.error : m.error } : m)) }))
      if (c.done) { currentRequest = null; void get().refreshLedger() }
    })
    window.sc.onMenu('open-folder', () => void get().openFolder())
    window.sc.onMenu('save', () => void get().saveActive())
    const last = localStorage.getItem('lastFolder')
    if (last) await get().openFolder(last)
  },
  openFolder: async (p) => {
    const root = p ?? (await window.sc.fs.pickFolder())
    if (!root) return
    localStorage.setItem('lastFolder', root)
    set({ projectRoot: root, tabs: [], active: null })
    await get().refreshTree()
  },
  refreshTree: async () => { const root = get().projectRoot; if (root) set({ tree: await window.sc.fs.tree(root) }) },
  openFile: async (p) => {
    const ex = get().tabs.find((t) => t.path === p)
    if (ex) { set({ active: p }); return }
    const content = await window.sc.fs.read(p)
    const name = p.split(/[\\/]/).pop() ?? p
    set((st) => ({ tabs: [...st.tabs, { path: p, name, content, saved: content, language: langOf(name) }], active: p }))
  },
  closeTab: (p) => set((st) => { const tabs = st.tabs.filter((t) => t.path !== p); return { tabs, active: st.active === p ? tabs[tabs.length - 1]?.path ?? null : st.active } }),
  setActive: (p) => set({ active: p }),
  updateContent: (p, c) => set((st) => ({ tabs: st.tabs.map((t) => (t.path === p ? { ...t, content: c } : t)) })),
  saveActive: async () => { const { active, tabs } = get(); const t = tabs.find((x) => x.path === active); if (!t) return; await window.sc.fs.write(t.path, t.content); set((st) => ({ tabs: st.tabs.map((x) => (x.path === t.path ? { ...x, saved: x.content } : x)) })) },
  writeAndOpen: async (p, content) => {
    await window.sc.fs.write(p, content)
    const name = p.split(/[\\/]/).pop() ?? p
    set((st) => { const exists = st.tabs.some((t) => t.path === p); const tabs = exists ? st.tabs.map((t) => (t.path === p ? { ...t, content, saved: content } : t)) : [...st.tabs, { path: p, name, content, saved: content, language: langOf(name) }]; return { tabs, active: p } })
    await get().refreshTree()
  },
  setSettings: async (s) => set({ settings: await window.sc.settings.set(s) }),
  setModal: (modal) => set({ modal }),
  setSelection: (selection) => set({ selection }),

  send: async (text, opts) => {
    const st = get()
    const active = st.tabs.find((t) => t.path === st.active)
    const ctxParts: string[] = []
    const attached: string[] = []
    // @file mentions → attach file contents
    for (const m of text.matchAll(/@([\w./\\-]+)/g)) {
      const needle = m[1]
      const node = findFile(st.tree, needle)
      if (node) { try { const c = await window.sc.fs.read(node.path); ctxParts.push(`File: ${rel(st.projectRoot, node.path)}\n\`\`\`\n${c.slice(0, 20000)}\n\`\`\``); attached.push(node.path) } catch { /* ignore */ } }
    }
    if (st.selection?.text) { ctxParts.push(`Selected in ${rel(st.projectRoot, st.selection.path)} (lines ${st.selection.startLine}-${st.selection.endLine}):\n\`\`\`\n${st.selection.text}\n\`\`\``) }
    else if (active && !attached.includes(active.path)) { ctxParts.push(`Currently open file: ${rel(st.projectRoot, active.path)}\n\`\`\`${active.language}\n${active.content.slice(0, 20000)}\n\`\`\``); attached.push(active.path) }
    const userContent = ctxParts.length ? `${ctxParts.join('\n\n')}\n\nTask: ${text}` : text
    const history: ChatMessage[] = st.messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }))
    const messages = [...history, { role: 'user' as const, content: userContent }]
    const userMsg: UiMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const { requestId, target, decision } = await window.sc.chat.start({ messages, attachedFiles: attached, projectRoot: st.projectRoot, forceTarget: opts?.forceTarget, mode: opts?.mode })
    currentRequest = requestId
    set((s) => ({ messages: [...s.messages, userMsg, { id: requestId, role: 'assistant', content: '', target, decision, streaming: true }] }))
  },
  cancel: () => { if (currentRequest) { void window.sc.chat.cancel(currentRequest); set((st) => ({ messages: st.messages.map((m) => (m.id === currentRequest ? { ...m, streaming: false } : m)) })); currentRequest = null } },
  setSteps: (steps) => set({ steps }),
  clearChat: () => set({ messages: [], steps: [] }),
  refreshLedger: async () => set({ ledger: await window.sc.ledger() }),
}))

export const rel = (root: string | null, p: string) => (root && p.startsWith(root) ? p.slice(root.length + 1) : p)
export function findFile(tree: FileNode | null, needle: string): FileNode | null {
  if (!tree) return null
  const n = needle.replace(/\\/g, '/')
  let best: FileNode | null = null
  const walk = (node: FileNode) => { if (!node.isDir) { const p = node.path.replace(/\\/g, '/'); if (p.endsWith('/' + n) || node.name === n) { if (!best || node.path.length < best.path.length) best = node } } node.children?.forEach(walk) }
  walk(tree)
  return best
}
export function allFiles(tree: FileNode | null): FileNode[] { const out: FileNode[] = []; const walk = (n: FileNode) => { if (!n.isDir) out.push(n); n.children?.forEach(walk) }; if (tree) walk(tree); return out }
