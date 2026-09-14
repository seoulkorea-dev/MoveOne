# MoveOne
Advanced AI Course)

프로젝트 이름 - MoveOne
수도권 대중교통 통합 이동 서비스

| 영역 | 다루는 것 | 주 작업 위치 | 현재 상태 |
| --- | --- | --- | --- |
| **① 환경 설정** | WSL2·Node·pnpm·Python, VS Code, Docker/Postgres, 포트·DB 역할 | Claude Code (WSL) | 구성 확정, 구축 진행 중 |
| **② 기획·연동** | manyfast.io 기획서, Stitch 와이어프레임, Notion 문서, 외부 API 키·정책 | Cowork (이 앱) | PRD·유저플로우 완료, ODsay 키 재발급 대기 |
| **③ 개발** | Next.js 코드, DB 스키마, 인증·보안, 화면 구현 | Claude Code (WSL) | 스캐폴드 동작, Stitch 시안 미반영 |

| 항목 | 값 | 비고 |
| --- | --- | --- |
| 앱 포트 | 4100 | 직전 프로젝트와 충돌 회피 |
| DB 포트 | 5433 | Postgres (Docker) |
| 마이그레이션 실행 역할 | `app` | 슈퍼유저 |
| 런타임 DATABASE_URL 역할 | `moveone_app` | RLS 적용을 위한 전용 역할 |
| 메일 전송 | `MAIL_TRANSPORT=console` | 개발 중엔 터미널 출력 |

| 산출물 | 위치 | 상태 (2026-09-11 기준) |
| --- | --- | --- |
| PRD · 요구사항 · 유저플로우 | manyfast.io — 프로젝트 "수도권 통합 멀티모달 이동 서비스"
id `a5ff04f8-e25d-446a-8402-cbe08e5a65b0` | PRD 5개 섹션 완성 / 요구사항 7개(수락기준 36개) / 유저플로우 7섹션·66노드·화면 30개 / **Feature·Spec은 0개** |
| 와이어프레임 | Google Stitch | 시안 있음, 코드 미반영 |
| DB Table 정의서 | Notion — AI PM 코스 수업 (AI 심화 과정) > [Day8] 개발 및 관리 기초 지식 | 31개 테이블, 2026-09-09 v1.0 |
| 문제정의·페르소나·CJM·AARRR | Notion — AI PM 코스 수업 (AI 심화 과정) > [Day2]~[Day7] | 수업 진행분 |

| 연동 | 방식 | Cowork (이 앱) | Claude Code (WSL) |
| --- | --- | --- | --- |
| Notion | 원격 커넥터 | 가능 (연결됨) | 가능 |
| manyfast.io | 원격 HTTP MCP | 가능 | 가능 |
| Google Stitch | 로컬 stdio (`npx @google/stitch-mcp`) | **불가** | 가능 |
| ODsay 대중교통 MCP | 개발 중 활용 방침 | — | — |

| 새 이름 | 여기서 할 일 | 도구 |
| --- | --- | --- |
| `MoveOne / 1 · 환경` | WSL·Node·pnpm·Docker·포트·VS Code 설치와 오류. 기존 "Window 로컬 앱 개발 환경" 대화를 이 이름으로 바꿔 쓰면 됩니다 | Claude Code (WSL) |
| `MoveOne / 2 · 기획·연동` | manyfast.io 기획서 읽기·수정, Notion 정리, API 키·정책 확인, 범위·일정 조정 | Cowork (이 앱) |
| `MoveOne / 3 · 개발` | 코드 작성, DB 마이그레이션, 화면 구현, 디버깅 | Claude Code (WSL) |

## 어느 쪽에서 할지 헷갈릴 때

- **터미널을 쳐야 하는 일**이면 → 1 · 환경
- **문서를 읽거나 고치는 일**이면 → 2 · 기획·연동
- **파일이 바뀌는 일**이면 → 3 · 개발
- Stitch 시안이 필요한 화면 작업은 Stitch MCP가 로컬에서만 붙으므로 **반드시 Claude Code(WSL)** 쪽에서

## 새 세션 시작할 때 붙일 문구

새 대화는 이전 대화를 기억하지 못하므로, 첫 메시지에 이 페이지를 가리켜 주면 됩니다.

```
MoveOne 프로젝트의 [환경 / 기획·연동 / 개발] 작업을 이어서 합니다.
프로젝트 전체 맥락은 Notion의 "MoveOne 프로젝트 허브" 페이지에 정리돼 있으니 먼저 읽어주세요.
오늘 할 일: (여기에 작업 내용)
```

## 이 페이지 유지 규칙

- 결정이 바뀌면 **해당 영역 섹션만** 고칩니다 (한 사실은 한 곳에만)
- 각 결정에는 날짜를 함께 적습니다
- "확인된 제약"과 "미해결" 항목은 지우지 말고 **해결 시 상태를 바꿔** 기록으로 남깁니다

MoveOne 프로젝트 허브
