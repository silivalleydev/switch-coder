import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { Settings, LedgerEntry } from '../shared/types'

export const dataDir = join(homedir(), '.switchcoder')
export const modelsDir = join(dataDir, 'models')
const settingsFile = join(dataDir, 'settings.json')
const ledgerFile = join(dataDir, 'ledger.json')

export const defaultSettings: Settings = {
  routeMode: 'auto',
  localModelPath: join(modelsDir, 'flint-UD-IQ3_XXS.gguf'),
  localPort: 8731,
  contextSize: 16384,
  gpuLayers: 99,
  reasoningBudget: 1024,
  vercelToken: '',
  byokEnabled: false,
  anthropicApiKey: '',
  anthropicModel: 'claude-sonnet-5-5',
  openaiCompatBaseUrl: 'http://127.0.0.1:11434/v1',
  openaiCompatApiKey: '',
  openaiCompatModel: '',
  cloudModelId: 'anthropic',
  language: 'ko',
  plan: 'free',
  autoRouteThreshold: 60,
}

function ensureDir() { if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true }); if (!existsSync(modelsDir)) mkdirSync(modelsDir, { recursive: true }) }

export function loadSettings(): Settings {
  ensureDir()
  try { return { ...defaultSettings, ...JSON.parse(readFileSync(settingsFile, 'utf8')) } } catch { return { ...defaultSettings } }
}
export function saveSettings(s: Partial<Settings>): Settings {
  const merged = { ...loadSettings(), ...s }
  writeFileSync(settingsFile, JSON.stringify(merged, null, 2))
  return merged
}
export function loadLedger(): LedgerEntry[] {
  ensureDir()
  try { return JSON.parse(readFileSync(ledgerFile, 'utf8')) } catch { return [] }
}
export function appendLedger(e: LedgerEntry) {
  const l = loadLedger(); l.unshift(e); writeFileSync(ledgerFile, JSON.stringify(l.slice(0, 500), null, 2))
}
export function userDataPath() { return app.getPath('userData') }
