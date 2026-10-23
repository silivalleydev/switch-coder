# SwitchCoder 요금제 (초안, 2026-10)

원칙: **모든 추론은 사용자 기기에서 (Flint, Apache 2.0). 우리 쪽 GPU·토큰 원가 0.** 그래서 Cursor의 1/4 가격이 가능하고, 평생 라이선스도 팔 수 있다.
클라우드 모델은 우리가 제공하지 않는다. 원하는 사용자만 자기 API 키(BYOK)를 넣어 직접 호출하며, 그 비용은 사용자가 Anthropic/OpenAI에 직접 낸다.

| 플랜 | 월 | 연 (월환산) | 평생 | Cursor 대응 | 포함 |
|---|---|---|---|---|---|
| Free | $0 | — | — | Hobby ($0) | 로컬 Flint 무제한·오프라인, 에디터 전체(Monaco, ⌘K, 채팅), Privacy Lock, Ledger |
| Pro | $5 | $48 ($4) | $79 | Pro ($20) | + Step Planner, 로컬 모델 다중 전환(모든 GGUF), BYOK + Switch Router, R2 미러 고속 다운로드, 우선 지원 |
| Max | $9 | $84 ($7) | $149 | Pro+ ($60) | + @codebase 전체 인덱싱, 백그라운드 에이전트(로컬 큐), 암호화 동기화, 신규 양자화 조기 접근 |
| Team | $12/인 | — | — | Teams ($40/인) | Max 전부 + 팀 Ledger, 중앙 결제, SSO, 공유 정책(저장소별 Privacy Lock 강제), 사내 llama-server 연결 |

## 우리 원가
- 추론: $0 (사용자 기기)
- 모델 배포: Cloudflare R2는 egress 무료. 저장 14.5GB × $0.015/GB ≈ 월 $0.2
- 결제 수수료 + 서버(switchlog-server 재사용, Vercel): 월 수십 달러 고정
- → Pro $5의 거의 전부가 마진. 가격 경쟁력은 "Cursor는 GPU 빌을 전가하고 우리는 전가할 게 없다"는 구조에서 나온다.

## 왜 유료 플랜을 사는가 (로컬인데)
Free로도 코딩이 된다. 유료는 **편의 기능**을 산다: 단계 계획, 모델 전환, 전체 인덱싱, 동기화, 팀 정책. 모두 로컬에서 도는 소프트웨어 기능이라 사용량이 늘어도 우리 비용이 늘지 않는다.

## 다음 단계
- Stripe Checkout + Customer Portal / Mac App Store IAP (switchlog-server 결제 코드 재사용)
- 라이선스 키 검증은 오프라인 가능하게 (서명된 토큰, 7일 유예)
- 팀 정책 서버 동기화
