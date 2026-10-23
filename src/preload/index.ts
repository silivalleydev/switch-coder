import { contextBridge, ipcRenderer } from 'electron'
import type { ChatChunk, ChatMessage, FileNode, LedgerEntry, LocalServerStatus, ModelTarget, RouteDecision, Settings } from '../shared/types'

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
  onMenu: (name: 'open-folder' | 'save', fn: () => void) => { const h = () => fn(); ipcRenderer.on(`menu:${name}`, h); return () => { ipcRenderer.off(`menu:${name}`, h) } },
}
contextBridge.exposeInMainWorld('sc', api)
export type Api = typeof api
