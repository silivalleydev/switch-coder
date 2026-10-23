import type { AgentEvent } from '../../../shared/types'

/** Rule-based, zero-latency translation of agent events into plain language for non-developers. */
export function humanize(ev: AgentEvent, lang: 'ko' | 'en'): { kind: 'think' | 'file' | 'cmd' | 'error' | 'fix' | 'ok' | 'info'; text: string; detail?: string } | null {
  const ko = lang === 'ko'
  const base = (p: unknown) => String(p ?? '').split(/[\\/]/).pop() ?? ''
  if (ev.type === 'reasoning') {
    const first = ev.text.replace(/\s+/g, ' ').trim().slice(0, 140)
    return { kind: 'think', text: ko ? '생각 중' : 'Thinking', detail: first }
  }
  if (ev.type === 'assistant') return { kind: 'info', text: ev.text.slice(0, 300) }
  if (ev.type === 'tool_call') {
    const a = ev.args
    switch (ev.name) {
      case 'list_files': return { kind: 'info', text: ko ? '프로젝트 구조 살펴보는 중' : 'Looking at the project structure' }
      case 'read_file': return { kind: 'file', text: ko ? `${base(a.path)} 읽는 중` : `Reading ${base(a.path)}`, detail: String(a.path ?? '') }
      case 'write_file': {
        const p = String(a.path ?? ''); const f = base(p)
        const what = /\.(tsx|jsx|vue|svelte)$/.test(p) ? (ko ? '화면' : 'screen') : /\.(css|scss)$/.test(p) ? (ko ? '스타일' : 'styles') : /package\.json$/.test(p) ? (ko ? '프로젝트 설정' : 'project config') : /\.(test|spec)\./.test(p) ? (ko ? '테스트' : 'test') : /\.(md)$/.test(p) ? (ko ? '문서' : 'doc') : /api|server|route/.test(p) ? (ko ? '서버 로직' : 'server logic') : (ko ? '코드' : 'code')
        return { kind: 'file', text: ko ? `${what} 작성 중: ${f}` : `Writing ${what}: ${f}`, detail: p }
      }
      case 'run_command': {
        const c = String(a.command ?? '')
        if (/npm (i|install|ci)|pnpm (i|install)|yarn( install)?$/.test(c)) return { kind: 'cmd', text: ko ? '필요한 라이브러리 설치 중' : 'Installing libraries', detail: c }
        if (/npm create|create-next-app|create-expo|vite@latest/.test(c)) return { kind: 'cmd', text: ko ? '프로젝트 뼈대 만드는 중' : 'Scaffolding the project', detail: c }
        if (/run dev|vite$|next dev|expo start/.test(c)) return { kind: 'cmd', text: ko ? '앱 실행해서 확인하는 중' : 'Starting the app to check it', detail: c }
        if (/run build|tsc|vite build|next build/.test(c)) return { kind: 'cmd', text: ko ? '빌드가 되는지 검사 중' : 'Checking that the build passes', detail: c }
        if (/test|vitest|jest/.test(c)) return { kind: 'cmd', text: ko ? '테스트 실행 중' : 'Running tests', detail: c }
        if (/lint|prettier/.test(c)) return { kind: 'cmd', text: ko ? '코드 정리 검사 중' : 'Linting', detail: c }
        return { kind: 'cmd', text: ko ? '명령 실행 중' : 'Running a command', detail: c }
      }
      case 'deploy': return { kind: 'cmd', text: ko ? 'Vercel에 배포 중' : 'Deploying to Vercel' }
      case 'finish': return { kind: 'ok', text: ko ? '마무리 중' : 'Wrapping up' }
    }
  }
  if (ev.type === 'tool_result') {
    if (ev.ok) return null
    if (ev.name === 'run_command') return { kind: 'error', text: ko ? '실행 중 오류가 나서 원인을 찾는 중' : 'Something failed; finding the cause', detail: ev.output.slice(-600) }
    return { kind: 'error', text: ko ? `${ev.name} 실패, 다시 시도` : `${ev.name} failed, retrying`, detail: ev.output.slice(-300) }
  }
  if (ev.type === 'error') return { kind: 'error', text: ev.message }
  if (ev.type === 'done') return { kind: 'ok', text: ev.summary.slice(0, 400) }
  return null
}

export const STAGE_LABEL: Record<string, { ko: string; en: string }> = {
  analyze: { ko: '분석', en: 'Analyze' }, recon: { ko: '참고 앱', en: 'Reference' }, plan: { ko: '기획', en: 'Plan' }, blueprint: { ko: '설계', en: 'Design' }, build: { ko: '구현', en: 'Build' }, qa: { ko: 'QA', en: 'QA' }, deploy: { ko: '배포', en: 'Deploy' }, done: { ko: '완료', en: 'Done' },
}
