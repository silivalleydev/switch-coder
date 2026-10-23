import { contextBridge, ipcRenderer } from 'electron'
import type { AgentEvent, ChatChunk, ChatMessage, FileNode, LedgerEntry, LocalServerStatus, ModelTarget, ProcInfo, ProcOutput, RouteDecision, Settings, TemplateId } from '../shared/types'

const api = {
  settings: { get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'), set: (s: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', s) },
  ledger: (): Promise<LedgerEntry[]> => ipcRenderer.invoke('ledger:get'),
  appInfo: (): Promise<{ version: string; platform: string; modelsDir: string; llamaBin: string | null }> => ipcRenderer.invoke('app:info'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open', url),
  fs: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('fs:pickFolder'),
    tree: (root: string): Promise<FileNode> => ipcRenderer.invoke('fs:tree', root),
    read: (p: string): Promise<string> => ipcRenderer.invoke('fs:read', p),
    write: (p: string, c: string): Promise<void> => ipcRenderer.invoke('fs:write', p, c),
    createFile: (p: string): Promise<void> => ipcRenderer.invoke('fs:createFile', p),
    createDir: (p: string): Promise<void> => ipcRenderer.invoke('fs:createDir', p),
    remove: (p: string): Promise<void> => ipcRenderer.invoke('fs:remove', p),
    rename: (a: string, b: string): Promise<void> => ipcRenderer.invoke('fs:rename', a, b),
    search: (root: string, q: string): Promise<{ path: string; line: number; text: string }[]> => ipcRenderer.invoke('fs:search', root, q),
  },
  llama: {
    status: (): Promise<LocalServerStatus> => ipcRenderer.invoke('llama:status'),
    models: (): Promise<{ name: string; path: string; sizeGb: number }[]> => ipcRenderer.invoke('llama:models'),
    start: (): Promise<LocalServerStatus> => ipcRenderer.invoke('llama:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('llama:stop'),
    onStatus: (fn: (s: LocalServerStatus) => void) => { const h = (_: unknown, s: LocalServerStatus) => fn(s); ipcRenderer.on('llama:status', h); return () => { ipcRenderer.off('llama:status', h) } },
  },
  chat: {
    route: (messages: ChatMessage[], attachedFiles: number): Promise<RouteDecision> => ipcRenderer.invoke('chat:route', messages, attachedFiles),
    start: (p: { messages: ChatMessage[]; attachedFiles: string[]; projectRoot: string | null; forceTarget?: 'local' | 'cloud'; mode?: 'chat' | 'plan' }): Promise<{ requestId: string; target: ModelTarget; decision: RouteDecision }> => ipcRenderer.invoke('chat:start', p),
    cancel: (id: string) => ipcRenderer.invoke('chat:cancel', id),
    onChunk: (fn: (c: ChatChunk) => void) => { const h = (_: unknown, c: ChatChunk) => fn(c); ipcRenderer.on('chat:chunk', h); return () => { ipcRenderer.off('chat:chunk', h) } },
  },
  agent: {
    start: (p: { root: string; task: string; reset?: boolean }): Promise<{ ok: boolean }> => ipcRenderer.invoke('agent:start', p),
    cancel: (runId: string) => ipcRenderer.invoke('agent:cancel', runId),
    reset: (root: string) => ipcRenderer.invoke('agent:reset', root),
    onEvent: (fn: (e: AgentEvent) => void) => { const h = (_: unknown, e: AgentEvent) => fn(e); ipcRenderer.on('agent:event', h); return () => { ipcRenderer.off('agent:event', h) } },
  },
  proc: {
    list: (): Promise<ProcInfo[]> => ipcRenderer.invoke('proc:list'),
    stop: (id: string) => ipcRenderer.invoke('proc:stop', id),
    log: (id: string): Promise<string> => ipcRenderer.invoke('proc:log', id),
    run: (p: { root: string; command: string; background?: boolean }): Promise<ProcInfo | { code: number | null; output: string }> => ipcRenderer.invoke('proc:run', p),
    onOutput: (fn: (o: ProcOutput) => void) => { const h = (_: unknown, o: ProcOutput) => fn(o); ipcRenderer.on('proc:output', h); return () => { ipcRenderer.off('proc:output', h) } },
  },
  project: {
    pickParent: (): Promise<string | null> => ipcRenderer.invoke('project:pickParent'),
    create: (p: { parent: string; name: string; template: TemplateId }): Promise<{ root: string; dev: string | null }> => ipcRenderer.invoke('project:create', p),
  },
  onMenu: (name: 'open-folder' | 'save', fn: () => void) => { const h = () => fn(); ipcRenderer.on(`menu:${name}`, h); return () => { ipcRenderer.off(`menu:${name}`, h) } },
}
contextBridge.exposeInMainWorld('sc', api)
export type Api = typeof api
