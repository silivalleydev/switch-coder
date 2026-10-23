export type ProviderKind = 'local' | 'anthropic' | 'openai-compatible'

export interface ModelTarget {
  id: string            // unique key e.g. "local:flint", "anthropic:claude-sonnet-5-5"
  kind: ProviderKind
  label: string
  model: string         // model name sent to the API
  baseUrl?: string      // for local / openai-compatible
  pricePerMTokIn?: number   // USD, 0 for local
  pricePerMTokOut?: number
}

export type RouteMode = 'auto' | 'local' | 'cloud' | 'privacy-lock'

export interface Settings {
  routeMode: RouteMode
  localModelPath: string
  localPort: number
  contextSize: number
  gpuLayers: number
  reasoningBudget: number   // tokens Flint may spend thinking; -1 unlimited, 0 off
  vercelToken: string       // optional: personal token instead of browser login
  byokEnabled: boolean      // user's own cloud key; off by default (no cost to us)
  anthropicApiKey: string
  anthropicModel: string
  openaiCompatBaseUrl: string
  openaiCompatApiKey: string
  openaiCompatModel: string
  cloudModelId: string
  language: 'ko' | 'en'
  plan: 'free' | 'pro' | 'max' | 'team'
  autoRouteThreshold: number   // complexity score 0-100 above which auto mode goes to cloud
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  requestId: string
  messages: ChatMessage[]
  target: ModelTarget
  maxTokens?: number
  temperature?: number
}

export interface ChatChunk {
  requestId: string
  delta?: string
  reasoning?: string
  done?: boolean
  error?: string
  usage?: { input: number; output: number }
}

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
}

export interface LocalServerStatus {
  state: 'stopped' | 'starting' | 'running' | 'error'
  pid?: number
  port?: number
  modelPath?: string
  message?: string
  tokPerSec?: number
}

export interface LedgerEntry {
  id: string
  at: number
  targetId: string
  kind: ProviderKind
  files: string[]
  inputTokens: number
  outputTokens: number
  estCostUsd: number
  reason: string
}

export interface RouteDecision {
  target: 'local' | 'cloud'
  score: number
  reasons: string[]
}

// ---- vibe-coding agent
export type AgentEvent =
  | { runId: string; type: 'status'; text: string }
  | { runId: string; type: 'reasoning'; text: string }
  | { runId: string; type: 'assistant'; text: string }
  | { runId: string; type: 'tool_call'; callId: string; name: string; args: Record<string, unknown> }
  | { runId: string; type: 'tool_result'; callId: string; name: string; ok: boolean; output: string }
  | { runId: string; type: 'done'; summary: string; iterations: number }
  | { runId: string; type: 'error'; message: string }

export interface ProcInfo { id: string; command: string; pid?: number; cwd: string; running: boolean; url?: string }
export type ProcOutput = { id: string; chunk: string; url?: string; exited?: number | null }

export type TemplateId = 'vite-react' | 'next' | 'expo' | 'python' | 'empty'
export interface Template { id: TemplateId; name: string; desc: { ko: string; en: string }; command?: string; dev?: string }

// ---- deploy (Vercel)
export type DbProvider = 'supabase' | 'neon'
export interface VercelStatus { cliAvailable: boolean; loggedIn: boolean; user?: string; project?: { id: string; orgId: string; name?: string }; db: DbProvider | null; envKeys: string[] }
