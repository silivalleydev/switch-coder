export type Lang = 'ko' | 'en'
const dict = {
  ko: {
    openFolder: '폴더 열기', noFolder: '열린 폴더가 없습니다', explorer: '탐색기', chat: '채팅', plan: '단계 계획', send: '보내기', stop: '중지',
    placeholder: '무엇을 만들까요? @파일 로 컨텍스트 추가, Cmd+K 로 인라인 편집', local: '로컬', cloud: '클라우드', auto: '자동', privacy: '프라이버시 잠금',
    modelStopped: '로컬 모델 꺼짐', modelStarting: '모델 로딩 중…', modelRunning: 'Flint 준비됨', modelError: '모델 오류', startModel: '로컬 모델 시작', stopModel: '모델 중지',
    settings: '설정', plans: '요금제', ledger: '프라이버시 장부', apply: '적용', applied: '적용됨', copy: '복사', unsaved: '저장 안 됨',
    routeTo: '라우팅', score: '복잡도', reason: '이유', runStep: '이 단계 실행', planHint: '큰 작업은 작은 단계로 쪼개면 Flint가 훨씬 잘합니다.',
    inlineEdit: '인라인 편집 (Cmd+K)', inlinePlaceholder: '선택한 코드를 어떻게 바꿀까요?', accept: '수락', reject: '거절',
    welcome: 'SwitchCoder에 오신 것을 환영합니다', welcomeSub: '로컬 Flint로 무료·오프라인 바이브코딩. 클라우드는 원할 때만 내 키로.',
    emptyChat: '여기에 질문하거나 코드를 요청하세요. 열린 파일은 자동으로 컨텍스트에 포함됩니다.',
    build: '빌드', chatOnly: '대화', preview: '프리뷰', code: '코드', terminal: '터미널', openProject: '프로젝트 열기', newProject: '새 프로젝트', recent: '최근 프로젝트',
    projectName: '프로젝트 이름', template: '템플릿', location: '만들 위치', firstPrompt: '무엇을 만들까요? (선택)', create: '만들기', creating: '만드는 중…',
    buildPlaceholder: '만들고 싶은 걸 말하세요. 에이전트가 파일을 쓰고 실행합니다.', noPreview: '아직 실행 중인 서버가 없습니다. 에이전트에게 "실행해줘"라고 하거나 터미널에서 dev 서버를 켜세요.',
    agentIdle: '에이전트가 파일을 만들고 실행하는 과정이 여기 표시됩니다.', closeProject: '프로젝트 닫기', startTagline: '말하면 만들어지는 로컬 바이브코딩. Flint가 내 맥에서 돕니다.',
  },
  en: {
    openFolder: 'Open Folder', noFolder: 'No folder open', explorer: 'Explorer', chat: 'Chat', plan: 'Step Plan', send: 'Send', stop: 'Stop',
    placeholder: 'What should we build? @file adds context, Cmd+K for inline edit', local: 'Local', cloud: 'Cloud', auto: 'Auto', privacy: 'Privacy lock',
    modelStopped: 'Local model off', modelStarting: 'Loading model…', modelRunning: 'Flint ready', modelError: 'Model error', startModel: 'Start local model', stopModel: 'Stop model',
    settings: 'Settings', plans: 'Plans', ledger: 'Privacy ledger', apply: 'Apply', applied: 'Applied', copy: 'Copy', unsaved: 'Unsaved',
    routeTo: 'Route', score: 'Complexity', reason: 'Why', runStep: 'Run this step', planHint: 'Flint does far better when big tasks are split into small steps.',
    inlineEdit: 'Inline edit (Cmd+K)', inlinePlaceholder: 'How should the selection change?', accept: 'Accept', reject: 'Reject',
    welcome: 'Welcome to SwitchCoder', welcomeSub: 'Free, offline vibe coding with local Flint. Cloud only with your own key.',
    emptyChat: 'Ask anything or request code. Open files are added to context automatically.',
    build: 'Build', chatOnly: 'Chat', preview: 'Preview', code: 'Code', terminal: 'Terminal', openProject: 'Open project', newProject: 'New project', recent: 'Recent',
    projectName: 'Project name', template: 'Template', location: 'Location', firstPrompt: 'What should we build? (optional)', create: 'Create', creating: 'Creating…',
    buildPlaceholder: 'Describe what you want. The agent writes files and runs them.', noPreview: 'No dev server running yet. Ask the agent to "run it" or start one in the terminal.',
    agentIdle: 'The agent\'s file writes and command runs show up here.', closeProject: 'Close project', startTagline: 'Local vibe coding: say it, and it gets built. Flint runs on your Mac.',
  },
} as const
export type Key = keyof typeof dict.ko
export const t = (lang: Lang, k: Key) => dict[lang][k]
