# Switch Coder

**말하면 만들어지는 로컬 바이브코딩 앱.** 두뇌는 내 맥에서 도는 Recursive Flint(40B MoE, 2.5B 활성, Apache 2.0). 에이전트가 파일을 쓰고, 명령을 실행하고, 에러를 읽고 고치며, 결과는 앱 안 프리뷰에 바로 뜬다. 코드는 숨기지 않는다: 코드 탭에서 Monaco 에디터로 언제든 직접 수정할 수 있다.

## 흐름
1. 시작 화면: **프로젝트 열기** (최근 목록) 또는 **새 프로젝트** (Vite+React / Next / Expo / Python / 빈 폴더 + 첫 프롬프트)
2. 왼쪽 **빌드** 패널에 "할 일 앱 만들어줘" → 에이전트가 `list_files → write_file → run_command(npm run dev, background)` 를 돌리며 진행 상황을 카드로 보여줌
3. dev 서버 URL이 감지되면 오른쪽 **프리뷰** 탭에 자동 표시. **코드** 탭에서 수정, **터미널** 탭에서 직접 명령
4. 막히면 **대화** 모드로 질문하거나 ⌘K 인라인 편집

## 에이전트 도구
`list_files`, `read_file`, `write_file`, `run_command(background?)`, `finish`. 프로젝트 폴더 밖 접근과 위험 명령(`rm -rf /`, `sudo` 등)은 차단. 같은 에러 4회 실패 시 중단하고 설명. 반복 상한 30회.

## 우리만의 차별점
1. **Switch Router** — 요청마다 복잡도 점수(0-100)를 매겨 로컬 Flint ↔ 클라우드를 자동 선택. 보내기 전에 어디로 갈지와 이유를 미리 보여준다. `⌘/`로 수동 토글.
2. **Privacy Lock** — 한 번 켜면 모든 네트워크 호출 차단. 사내 코드, 미공개 프로젝트에 안전.
3. **Privacy Ledger** — 클라우드로 나간 모든 요청의 파일·토큰·추정 비용을 투명하게 기록 (로컬은 항상 $0).
4. **Step Planner** — Flint 같은 소형 모델은 큰 작업을 쪼개야 잘한다(Recursive 공식 권장). 작업을 3-8개 단계 JSON으로 분해하고 단계별로 실행.
5. **가격** — 추론이 전부 로컬이라 우리 GPU 비용이 0. 로컬 무제한 무료, Pro $5 (Cursor Pro $20의 1/4), 평생 라이선스 $79. 클라우드는 제공하지 않고 BYOK(내 키)만 선택 지원. 자세한 건 [PRICING.md](PRICING.md).

## 기능
- Monaco 에디터, 파일 트리, 탭, 저장(⌘S), Quick Open(⌘P)
- 채팅: 열린 파일/선택 영역 자동 컨텍스트, `@파일명` 멘션, 코드블록 **적용** 버튼 (`// path: src/x.ts` 헤더를 읽어 파일에 바로 씀)
- ⌘K 인라인 편집 (항상 로컬 Flint로 처리 → 선택 코드가 외부로 나가지 않음)
- 로컬 서버 관리: 앱 시작 시 `llama-server` 자동 기동, 메모리 부족 시 GPU 레이어 자동 축소(99→24→0)
- BYOK (기본 꺼짐): 사용자가 자기 Anthropic 키 또는 OpenAI 호환 엔드포인트(Ollama, LM Studio, vLLM)를 넣으면 그때만 Switch Router가 활성화. 우리 비용 0
- 한국어/영어 UI

## 요구 사항
- Node 20+
- `llama-server` **b11829 이상** (Flint 아키텍처 지원은 2026-10-21 PR #30928에서 머지됨. Homebrew 0.7.0 stable은 아직 미지원)
  - macOS: `resources/bin/`에 b11829 arm64 바이너리+dylib을 동봉해 두면 앱이 우선 사용 (git에는 안 올라감, 아래 스크립트로 받음)
  - Windows: 같은 릴리스의 `llama-b11829-bin-win-cpu-x64.zip`(또는 `win-cuda-12.4-x64`)을 풀어 `resources/bin/llama-server.exe`+dll로 두면 동봉됨
  - 없으면 PATH의 `llama-server`로 폴백
- 모델 GGUF: `~/.switchcoder/models/` 에 두면 설정에서 선택 가능
  - 24GB Mac 권장: `unsloth/flint-GGUF` → `flint-UD-IQ3_XXS.gguf` (14.5GB)
  - 48GB+: `RecursiveSI/flint-int4-gguf` (26GB) 또는 `flint-UD-Q4_K_XL.gguf`
  - 사내 배포용 미러: R2 `switchlog-models/flint/` (`scripts/upload-flint-to-r2.sh` 참고)

## 실행
```bash
npm install
scripts/fetch-llama.sh      # llama.cpp b11829 바이너리를 resources/bin/에 받기 (mac arm64 / win x64)
npm run dev
```

## 배포 빌드
```bash
npm run dist:mac    # dmg + zip (arm64, x64)
npm run dist:win    # nsis 설치본 + portable (x64, arm64) — macOS에서 크로스 빌드 가능
npm run dist:all
```
`release/`에 산출물이 생긴다. 서명/공증은 `electron-builder.yml`의 `mac.notarize`와 Apple 인증서 환경변수로 켠다.
`llama-server` 바이너리를 앱에 동봉하려면 `resources/bin/llama-server(.exe)`에 넣고 `electron-builder.yml`의 `extraResources`로 추가한다.

## 구조
```
src/main/      Electron 메인: fs IPC, llama-server 관리(llama.ts), 스트리밍 프로바이더(providers.ts), Switch 라우터(router.ts)
src/preload/   contextBridge → window.sc
src/renderer/  React + zustand + Monaco UI
src/shared/    타입
scripts/       모델 R2 업로드 스크립트
```
