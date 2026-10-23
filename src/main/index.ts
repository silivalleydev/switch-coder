import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'
import * as fsx from './fs'
import * as llama from './llama'
import { streamChat, cancel } from './providers'
import { decideRoute, CODER_SYSTEM, PLANNER_SYSTEM } from './router'
import { loadSettings, saveSettings, loadLedger, appendLedger, modelsDir } from './store'
import { runAgent, cancelAgent, type AgentMsg } from './agent'
import * as procs from './procs'
import * as vercel from './vercel'
import * as pipeline from './pipeline'
import * as iap from './iap'
import * as snaps from './snapshots'
import type { PipelineMode, Plan, Blueprint } from '../shared/types'
import type { DbProvider } from '../shared/types'
import { existsSync, mkdirSync } from 'fs'
import { dialog } from 'electron'
import type { TemplateId } from '../shared/types'
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
  procs.onProcOutput((o) => win?.webContents.send('proc:output', o))
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
    { label: 'SwitchCoder', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [{ label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: () => win?.webContents.send('menu:open-folder') }, { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => win?.webContents.send('menu:save') }] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]))
  if (!app.isPackaged && process.env.SC_QA_URL) { void import('./browserqa').then(async (m) => { const r = await m.browserQa(process.env.SC_QA_URL!); console.log('[qa] ' + JSON.stringify({ ok: r.ok, title: r.title, actions: r.actions, consoleErrors: r.consoleErrors, pageErrors: r.pageErrors, shot: r.screenshot?.length })); app.quit() }) }
  if (!app.isPackaged && process.env.SC_SELFTEST) { void procs.runCommand('echo PATH0=$(echo $PATH | cut -d: -f1) && node --version && npm --version && npx --version && which node npm', app.getPath('temp'), 60_000).then((r) => { console.log('[selftest]\n' + r.output + '[exit ' + r.code + ']'); if (process.env.SC_SELFTEST === 'exit') app.quit() }) }
  createWindow()
  iap.listen((lic) => { saveSettings({ plan: lic.plan }); win?.webContents.send('store:license', lic) })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => procs.stopAll())

// ---- vibe-coding agent
const agentHistory = new Map<string, AgentMsg[]>()   // per project root
ipcMain.handle('agent:start', async (e, p: { root: string; task: string; reset?: boolean }) => {
  const s = loadSettings()
  const { local, cloud } = targets(s)
  // the agent needs an OpenAI-compatible tools endpoint: local Flint, or a BYOK OpenAI-compatible server
  const target: ModelTarget = s.byokEnabled && s.routeMode === 'cloud' && cloud.kind === 'openai-compatible' ? cloud : local
  if (target.kind === 'local' && llama.getStatus().state !== 'running') throw new Error('Local model is not running. Start it from the status bar.')
  const history = p.reset ? [] : (agentHistory.get(p.root) ?? [])
  const sender = e.sender
  const msgs = await runAgent({ root: p.root, task: p.task, target, apiKey: target.kind === 'openai-compatible' ? s.openaiCompatApiKey : undefined, lang: s.language, history, contextChars: Math.max(20_000, s.contextSize * 2.5) },
    (ev) => { if (!sender.isDestroyed()) sender.send('agent:event', ev) })
  agentHistory.set(p.root, msgs)
  return { ok: true }
})
ipcMain.handle('agent:cancel', (_e, runId: string) => cancelAgent(runId))
ipcMain.handle('agent:reset', (_e, root: string) => agentHistory.delete(root))

// ---- processes (dev servers)
ipcMain.handle('proc:list', () => procs.listProcs())
ipcMain.handle('proc:stop', (_e, id: string) => procs.stopProcess(id))
ipcMain.handle('proc:log', (_e, id: string) => procs.procLog(id))
ipcMain.handle('proc:run', async (e, p: { root: string; command: string; background?: boolean }) => {
  const denied = procs.isDenied(p.command); if (denied) throw new Error(denied)
  if (p.background) return procs.startBackground(p.command, p.root)
  const sender = e.sender
  return procs.runCommand(p.command, p.root, 300_000, (c) => { if (!sender.isDestroyed()) sender.send('proc:output', { id: 'shell', chunk: c }) })
})

// ---- new project from template
const TEMPLATES: Record<TemplateId, { scaffold?: (name: string) => string; dev?: string; files?: Record<string, string> }> = {
  'vite-react': { scaffold: (n) => `npm create vite@latest "${n}" -- --template react-ts && cd "${n}" && npm install`, dev: 'npm run dev' },
  next: { scaffold: (n) => `npx --yes create-next-app@latest "${n}" --ts --app --tailwind --no-eslint --use-npm --yes --skip-install && cd "${n}" && npm install`, dev: 'npm run dev' },
  expo: { scaffold: (n) => `npx --yes create-expo-app@latest "${n}" --template blank-typescript --no-install && cd "${n}" && npm install`, dev: 'npx expo start --web' },
  python: { files: { 'main.py': 'def main():\n    print("hello from switch coder")\n\nif __name__ == "__main__":\n    main()\n', 'requirements.txt': '', 'README.md': '# {name}\n' } },
  empty: { files: { 'README.md': '# {name}\n' } },
}
ipcMain.handle('project:pickParent', () => (win ? fsx.pickFolder(win) : null))
ipcMain.handle('project:create', async (e, p: { parent: string; name: string; template: TemplateId }) => {
  const name = p.name.trim().replace(/[^\w.-]+/g, '-').toLowerCase() || 'my-app'
  const root = join(p.parent, name)
  if (existsSync(root)) throw new Error(`Folder already exists: ${root}`)
  const t = TEMPLATES[p.template]
  const sender = e.sender
  const log = (c: string) => { if (!sender.isDestroyed()) sender.send('proc:output', { id: 'shell', chunk: c }) }
  if (t.scaffold) {
    log(`$ ${t.scaffold(name)}\n`)
    const r = await procs.runCommand(t.scaffold(name), p.parent, 600_000, log)
    if (r.code !== 0) throw new Error(`Scaffold failed (exit ${r.code}). See terminal.`)
  } else {
    mkdirSync(root, { recursive: true })
    for (const [f, c] of Object.entries(t.files ?? {})) { const abs = join(root, f); mkdirSync(join(abs, '..'), { recursive: true }); await fsx.writeFile(abs, c.replace('{name}', name)) }
  }
  return { root, dev: t.dev ?? null }
})
// ---- all-in-one pipeline
function agentTarget(s: Settings): { target: ModelTarget; apiKey?: string } {
  const { local, cloud } = targets(s)
  const t = s.byokEnabled && s.routeMode === 'cloud' && cloud.kind === 'openai-compatible' ? cloud : local
  if (t.kind === 'local' && llama.getStatus().state !== 'running') throw new Error('Local model is not running. Start it from the status bar.')
  return { target: t, apiKey: t.kind === 'openai-compatible' ? s.openaiCompatApiKey : undefined }
}
const pipeEmit = (sender: Electron.WebContents) => ({
  state: (st: import('../shared/types').PipelineState) => { if (!sender.isDestroyed()) sender.send('pipeline:state', st) },
  agent: (ev: import('../shared/types').AgentEvent) => { if (!sender.isDestroyed()) sender.send('agent:event', ev) },
  activity: (a: Omit<import('../shared/types').Activity, 'id' | 'at'>) => { if (!sender.isDestroyed()) sender.send('pipeline:activity', { ...a, id: randomUUID(), at: Date.now() }) },
})
ipcMain.handle('pipeline:start', (e, p: { root: string; request: string; mode: PipelineMode; wantDeploy: boolean; reference?: import('../shared/types').ReferenceInput }) => { const s = loadSettings(); const { target, apiKey } = agentTarget(s); return pipeline.start({ ...p, target, apiKey, lang: s.language }, pipeEmit(e.sender)) })
ipcMain.handle('pipeline:approve', (_e, root: string, edits?: { plan?: Plan; blueprint?: Blueprint; recon?: import('../shared/types').ReconMap }) => pipeline.approve(root, edits))
ipcMain.handle('qa:browser', (_e, url: string) => import('./browserqa').then((m) => m.browserQa(url)))
ipcMain.handle('pipeline:cancel', (_e, root: string) => pipeline.cancel(root))
ipcMain.handle('pipeline:skip', (_e, root: string) => pipeline.skipTask(root))
ipcMain.handle('pipeline:current', (_e, root: string) => pipeline.current(root))
ipcMain.handle('pipeline:decideMode', (_e, root: string, request: string, mode: PipelineMode) => pipeline.decideMode(root, request, mode))
ipcMain.handle('snapshots:list', (_e, root: string) => snaps.list(root))
ipcMain.handle('snapshots:restore', (_e, root: string, sha: string) => snaps.restore(root, sha))
ipcMain.handle('snapshots:take', (_e, root: string, label: string) => snaps.snapshot(root, label))

// ---- deploy (Vercel)
const vlog = (e: Electron.IpcMainInvokeEvent) => (c: string) => { if (!e.sender.isDestroyed()) e.sender.send('proc:output', { id: 'vercel', chunk: c }) }
const vtoken = () => loadSettings().vercelToken || undefined
ipcMain.handle('vercel:status', (_e, root: string | null) => vercel.status(root, vtoken()))
ipcMain.handle('vercel:login', (e) => vercel.login(vlog(e)))
ipcMain.handle('vercel:link', (e, root: string, name: string) => vercel.link(root, name, vtoken(), vlog(e)))
ipcMain.handle('vercel:addDb', (e, root: string, provider: DbProvider) => vercel.addDb(root, provider, vtoken(), vlog(e)))
ipcMain.handle('vercel:envPull', (e, root: string) => vercel.envPull(root, vtoken(), vlog(e)))
ipcMain.handle('vercel:deploy', (e, root: string, prod: boolean) => vercel.deploy(root, prod, vtoken(), vlog(e)))
// ---- store billing (Mac App Store IAP; Microsoft Store add-ons via Store page)
ipcMain.handle('store:kind', () => iap.storeKind())
ipcMain.handle('store:license', () => iap.loadLicense())
ipcMain.handle('store:products', () => iap.products())
ipcMain.handle('store:purchase', (_e, id: string) => iap.purchase(id))
ipcMain.handle('store:restore', () => iap.restore())
ipcMain.handle('dialog:message', (_e, msg: string) => dialog.showMessageBox({ message: msg }))

// ---- settings
ipcMain.handle('settings:get', () => loadSettings())
ipcMain.handle('settings:set', (_e, s: Partial<Settings>) => saveSettings(s))
ipcMain.handle('ledger:get', () => loadLedger())
ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, modelsDir, llamaBin: llama.findLlamaServer(), devOpen: app.isPackaged ? null : process.env.SC_OPEN ?? null, devView: app.isPackaged ? null : process.env.SC_VIEW ?? null }))
ipcMain.handle('shell:open', (_e, url: string) => shell.openExternal(url))

// ---- fs
ipcMain.handle('fs:pickFolder', () => (win ? fsx.pickFolder(win) : null))
ipcMain.handle('fs:access', (_e, p: string) => fsx.accessFolder(p))
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
