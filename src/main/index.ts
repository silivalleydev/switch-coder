import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'
import * as fsx from './fs'
import * as llama from './llama'
import { streamChat, cancel } from './providers'
import { decideRoute, CODER_SYSTEM, PLANNER_SYSTEM } from './router'
import { loadSettings, saveSettings, loadLedger, appendLedger, modelsDir } from './store'
import type { ChatMessage, ModelTarget, Settings } from '../shared/types'

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#0f1115',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true, nodeIntegration: false },
  })
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  llama.onStatus((s) => win?.webContents.send('llama:status', s))
  if (process.env.SC_SHOT) win.webContents.once('did-finish-load', () => setTimeout(async () => { const img = await win!.webContents.capturePage(); writeFileSync(process.env.SC_SHOT!, img.toPNG()) }, Number(process.env.SC_SHOT_DELAY ?? 5000)))
  if (!app.isPackaged) win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) console.log(`[renderer:${level}] ${message}`) })
}

function targets(s: Settings): { local: ModelTarget; cloud: ModelTarget } {
  const local: ModelTarget = { id: 'local:flint', kind: 'local', label: 'Flint (local)', model: 'flint', baseUrl: `http://127.0.0.1:${s.localPort}/v1`, pricePerMTokIn: 0, pricePerMTokOut: 0 }
  const cloud: ModelTarget = s.cloudModelId === 'openai-compatible'
    ? { id: `oai:${s.openaiCompatModel}`, kind: 'openai-compatible', label: s.openaiCompatModel || 'OpenAI-compatible', model: s.openaiCompatModel, baseUrl: s.openaiCompatBaseUrl, pricePerMTokIn: 0, pricePerMTokOut: 0 }
    : { id: `anthropic:${s.anthropicModel}`, kind: 'anthropic', label: s.anthropicModel, model: s.anthropicModel, pricePerMTokIn: 3, pricePerMTokOut: 15 }
  return { local, cloud }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Switch Coder', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [{ label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: () => win?.webContents.send('menu:open-folder') }, { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => win?.webContents.send('menu:save') }] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]))
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ---- settings
ipcMain.handle('settings:get', () => loadSettings())
ipcMain.handle('settings:set', (_e, s: Partial<Settings>) => saveSettings(s))
ipcMain.handle('ledger:get', () => loadLedger())
ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, modelsDir, llamaBin: llama.findLlamaServer() }))
ipcMain.handle('shell:open', (_e, url: string) => shell.openExternal(url))

// ---- fs
ipcMain.handle('fs:pickFolder', () => (win ? fsx.pickFolder(win) : null))
ipcMain.handle('fs:tree', (_e, root: string) => fsx.readTree(root))
ipcMain.handle('fs:read', (_e, p: string) => fsx.readFile(p))
ipcMain.handle('fs:write', (_e, p: string, c: string) => fsx.writeFile(p, c))
ipcMain.handle('fs:createFile', (_e, p: string) => fsx.createFile(p))
ipcMain.handle('fs:createDir', (_e, p: string) => fsx.createDir(p))
ipcMain.handle('fs:remove', (_e, p: string) => fsx.removePath(p))
ipcMain.handle('fs:rename', (_e, a: string, b: string) => fsx.renamePath(a, b))
ipcMain.handle('fs:search', (_e, root: string, q: string) => fsx.searchText(root, q))

// ---- local model server
ipcMain.handle('llama:status', () => llama.getStatus())
ipcMain.handle('llama:models', () => llama.listModels())
ipcMain.handle('llama:start', async () => { const s = loadSettings(); return llama.startServer({ modelPath: s.localModelPath, port: s.localPort, contextSize: s.contextSize, gpuLayers: s.gpuLayers, reasoningBudget: s.reasoningBudget }) })
ipcMain.handle('llama:stop', () => llama.stopServer())

// ---- chat with Switch routing
ipcMain.handle('chat:route', (_e, messages: ChatMessage[], attachedFiles: number) => { const s = loadSettings(); return decideRoute(messages, s.routeMode, s.autoRouteThreshold, attachedFiles, s.byokEnabled) })

ipcMain.handle('chat:start', async (e, payload: { messages: ChatMessage[]; attachedFiles: string[]; projectRoot: string | null; forceTarget?: 'local' | 'cloud'; mode?: 'chat' | 'plan' }) => {
  const s = loadSettings()
  const { local, cloud } = targets(s)
  const forced = payload.forceTarget === 'cloud' && !s.byokEnabled ? 'local' : payload.forceTarget
  const decision = forced ? { target: forced, score: 0, reasons: ['Forced'] } : decideRoute(payload.messages, s.routeMode, s.autoRouteThreshold, payload.attachedFiles.length, s.byokEnabled)
  const target = decision.target === 'cloud' ? cloud : local
  const requestId = randomUUID()
  const system: ChatMessage = { role: 'system', content: payload.mode === 'plan' ? PLANNER_SYSTEM : CODER_SYSTEM(s.language, payload.projectRoot) }
  const messages = [system, ...payload.messages]
  const apiKey = target.kind === 'anthropic' ? s.anthropicApiKey : target.kind === 'openai-compatible' ? s.openaiCompatApiKey : ''
  const sender = e.sender
  let out = 0
  void streamChat({ requestId, messages, target, maxTokens: target.kind === 'local' ? 16384 : 8192 }, (chunk) => {
    if (chunk.delta) out += chunk.delta.length
    if (chunk.done) {
      const inTok = chunk.usage?.input ?? Math.round(messages.reduce((n, m) => n + m.content.length, 0) / 4)
      const outTok = chunk.usage?.output ?? Math.round(out / 4)
      appendLedger({ id: requestId, at: Date.now(), targetId: target.id, kind: target.kind, files: payload.attachedFiles, inputTokens: inTok, outputTokens: outTok,
        estCostUsd: (inTok * (target.pricePerMTokIn ?? 0) + outTok * (target.pricePerMTokOut ?? 0)) / 1e6, reason: decision.reasons.join(', ') })
    }
    if (!sender.isDestroyed()) sender.send('chat:chunk', chunk)
  }, { apiKey, networkAllowed: s.routeMode !== 'privacy-lock' })
  return { requestId, target, decision }
})
ipcMain.handle('chat:cancel', (_e, id: string) => cancel(id))
