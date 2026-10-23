export type Lang = 'ko' | 'en'
const dict = {
  ko: {
    openFolder: '폴더 열기', noFolder: '열린 폴더가 없습니다', explorer: '탐색기', chat: '채팅', plan: '단계 계획', send: '보내기', stop: '중지',
    placeholder: '무엇을 만들까요? @파일 로 컨텍스트 추가, Cmd+K 로 인라인 편집', local: '로컬', cloud: '클라우드', auto: '자동', privacy: '프라이버시 잠금',
    modelStopped: '로컬 모델 꺼짐', modelStarting: '모델 로딩 중…', modelRunning: 'Flint 준비됨', modelError: '모델 오류', startModel: '로컬 모델 시작', stopModel: '모델 중지',
    settings: '설정', plans: '요금제', ledger: '프라이버시 장부', apply: '적용', applied: '적용됨', copy: '복사', unsaved: '저장 안 됨',
    routeTo: '라우팅', score: '복잡도', reason: '이유', runStep: '이 단계 실행', planHint: '큰 작업은 작은 단계로 쪼개면 Flint가 훨씬 잘합니다.',
    inlineEdit: '인라인 편집 (Cmd+K)', inlinePlaceholder: '선택한 코드를 어떻게 바꿀까요?', accept: '수락', reject: '거절',
    welcome: 'Switch Coder에 오신 것을 환영합니다', welcomeSub: '로컬 Flint로 무료·오프라인 코딩, 필요할 때만 클라우드로 전환.',
    emptyChat: '여기에 질문하거나 코드를 요청하세요. 열린 파일은 자동으로 컨텍스트에 포함됩니다.',
  },
  en: {
    openFolder: 'Open Folder', noFolder: 'No folder open', explorer: 'Explorer', chat: 'Chat', plan: 'Step Plan', send: 'Send', stop: 'Stop',
    placeholder: 'What should we build? @file adds context, Cmd+K for inline edit', local: 'Local', cloud: 'Cloud', auto: 'Auto', privacy: 'Privacy lock',
    modelStopped: 'Local model off', modelStarting: 'Loading model…', modelRunning: 'Flint ready', modelError: 'Model error', startModel: 'Start local model', stopModel: 'Stop model',
    settings: 'Settings', plans: 'Plans', ledger: 'Privacy ledger', apply: 'Apply', applied: 'Applied', copy: 'Copy', unsaved: 'Unsaved',
    routeTo: 'Route', score: 'Complexity', reason: 'Why', runStep: 'Run this step', planHint: 'Flint does far better when big tasks are split into small steps.',
    inlineEdit: 'Inline edit (Cmd+K)', inlinePlaceholder: 'How should the selection change?', accept: 'Accept', reject: 'Reject',
    welcome: 'Welcome to Switch Coder', welcomeSub: 'Free, offline coding with local Flint. Switch to cloud only when it pays off.',
    emptyChat: 'Ask anything or request code. Open files are added to context automatically.',
  },
} as const
export type Key = keyof typeof dict.ko
export const t = (lang: Lang, k: Key) => dict[lang][k]
