# MoveOne 작업 티켓

8주 / 주 15시간 / 1인. 2026-09-14 ~ 11-06. 총 약 120시간.
**한 티켓 = 한 브랜치 = 한 worktree = 한 PR.** 착수는 `/ticket <ID>`.
범위는 `.claude/rules/00-project.md`. 여기 없는 일은 하지 않는다.

## 이미 되어 있는 것 (다시 만들지 말 것)

2026-09-11 스캐폴드 + 09-14 보안 패치로 아래는 코드가 존재한다. **동작 검증은 P1에서 한다.**

| 영역 | 있는 것 |
|---|---|
| DB | `db/schema.sql` 11개 테이블, `db/002_security.sql` — `moveone_app` 역할, 이메일 컬럼, 실패 카운터·잠금, `login_attempts`, `password_reset_tokens`, RLS 정책, `station_external_ids` |
| 인증 | register / login / logout / reset(request·confirm) 라우트, `lib/session.ts` `lib/password.ts` `lib/reset-token.ts` `lib/mailer.ts` |
| ODsay | `lib/odsay/{types,client,normalize}.ts`, `lib/cache.ts`, `lib/region.ts`, `app/api/transit/search`, `app/api/transit/select` |
| 카카오 | `app/api/places` (Local REST 프록시) |
| 도메인 | `lib/routes.ts` — `TransitRoute`/`RouteSegment`, `sortRoutes()` 4종 |
| 화면 | login·register·reset·reset/confirm, `app/page.tsx` + `route-search.tsx` — **기능만 동작. Stitch 시안 미반영** |
| 테스트 | `lib/__tests__/normalize.test.ts` 1개, `fixtures/odsay/gangnam-pangyo.json` |

| 단계 | 기간 | 주제 | 예상 |
|---|---|---|---|
| P0 | 09/14–09/20 | 기반 정착 — 리포·검증 파이프라인·키·DB | 15h |
| P1 | 09/21–09/27 | 기존 코드 실동작 검증·테스트 보강 | 15h |
| P2 | 09/28–10/11 | 화면 재구축 (Stitch 시안 + 하이브리드 대비) | 30h |
| P3 | 10/12–10/18 | 멀티모달 조합 엔진 | 15h |
| P4 | 10/19–10/25 | 경로 상세 화면 | 15h |
| P5 | 10/26–11/01 | 카카오맵 | 15h |
| P6 | 11/02–11/06 | 안정화·배포 | 15h |

---

## P0 — 기반 정착 (09/14–09/20, 15h)

### P0-1 프로젝트 부트스트랩 · 2h
- **목표** `~/projects/MoveOne` 에 리포 + 스캐폴드 + 설정이 올라간 상태.
- **완료 조건** `bootstrap.sh` 실행 완료 / `pnpm install` 성공 / `git status` 에 의도한 파일만 / `.env.local` 이 스테이지에 없음
- 이 티켓만 worktree 없이 main에서 한다.

### P0-2 검증 파이프라인 통과 · 3h
- **목표** `pnpm verify` 가 한 번에 통과한다.
- **완료 조건** `typecheck` `lint` `test` `build` 각각 통과 / 기존 `normalize.test.ts` 통과 / ESLint 규칙(any 금지, 클라이언트 process.env 금지, pg import 금지)에 걸리는 기존 코드가 있으면 규칙이 아니라 **코드를 고친다**
- **주의** 기존 코드가 새 린트 규칙에 다수 걸릴 수 있다. 규칙을 끄기 전에 왜 걸리는지 먼저 본다.

### P0-3 DB 기동·RLS 실동작 확인 · 3h
- **목표** DB가 뜨고 RLS가 실제로 막는지 눈으로 확인한다.
- **완료 조건**
  - `docker compose up -d` → healthy, `schema.sql`·`002_security.sql` 자동 적용됨
  - `db/test-security.sql` 실행 결과 확인
  - `moveone_app` 으로 접속했을 때 다른 사용자 행이 **안 보임**
  - `.env.local` 의 `DATABASE_URL` 이 `moveone_app` (`app` 아님)
- **스킬** `moveone-db`

### P0-4 ODsay 키 Server(IP) 타입 재발급 · 1h
- **목표** Android 타입 키를 버리고 Server(IP) 타입으로 바꾼다.
- **완료 조건** `curl ifconfig.me` 로 확인한 IP를 ODsay 콘솔 Server 플랫폼에 등록 / `/api/transit/search` 실호출 1건 성공 / 등록한 IP를 `docs/api-notes.md` 에 기록
- **주의** URI·IP 각 5개까지만 등록 가능. 집·회사·배포용을 아껴 쓴다.
- 콘솔 작업이라 Claude가 대신할 수 없다.

### P0-5 훅·worktree 실전 점검 · 2h
- **완료 조건** `./scripts/wt.sh new P0-5 smoke` 로 다른 포트에 dev 서버가 뜸 / 일부러 타입 오류를 넣어 Stop 훅이 잡는 것 확인 / `.env` 편집이 PreToolUse 훅에 막히는 것 확인 / `./scripts/wt.sh rm P0-5`

### P0-6 MCP 연결 확인 · 2h
- **완료 조건** `claude mcp list` 에서 notion·stitch·playwright 가 connected / manyfast·ODsay는 URL·토큰 환경변수를 넣고 연결 (없으면 미해결로 기록)

### P0-7 Stitch 시안 대응표 · 2h
- **완료 조건** `docs/screens.md` 에 [화면 · 라우트 · Stitch 링크 · 현재 상태] 표. 1차 범위 화면 중 시안이 없는 것을 명시.

---

## P1 — 기존 코드 실동작 검증 (09/21–09/27, 15h)

코드는 있지만 **한 번도 끝까지 돌려본 적이 없다.** 여기서 실제로 돌리고 테스트로 고정한다.

### P1-1 인증 흐름 수동 검증 · 3h
- **완료 조건** 가입 → 로그인 → 로그아웃 / 5회 실패로 잠김 / 잠긴 뒤 올바른 비번도 거부 / 재설정 메일이 콘솔에 출력 / 재설정 후 잠금 해제 + 기존 세션 무효화 — 전부 브라우저에서 확인
- 깨진 것은 고치고, 고친 것마다 **먼저 실패하는 테스트**를 쓴다.

### P1-2 인증 단위 테스트 · 4h
- **완료 조건** 4회 실패 후 성공 시 카운터 초기화 / 5회째 잠김 / 재설정 토큰 만료·재사용 거부 / 평문 토큰이 DB에 없음 / 미등록 이메일도 같은 응답·같은 화면
- **에이전트** `test-writer`

### P1-3 경로 검색 흐름 검증 · 3h
- **완료 조건** 실제 ODsay 키로 강남→판교 검색 성공 / 캐시 히트 시 ODsay를 안 부르는 것 확인 / 수도권 밖 좌표가 검색 전에 안내되는 것 확인 / 응답이 `TransitRoute` 로만 올라오는 것 확인
- 실제 응답이 `fixtures/odsay/gangnam-pangyo.json` 과 다르면 **fixture를 교체하고** 테스트를 고친다.

### P1-4 도메인 로직 테스트 보강 · 5h
- **완료 조건** `sortRoutes()` 4종 정렬 / 3분 이하 도보 칩 생략 / `lib/region.ts` 경계 좌표 / `lib/cache.ts` 키 정규화·TTL 만료 — 각각 테스트
- **에이전트** `test-writer`

---

## P2 — 화면 재구축 (09/28–10/11, 30h)

현재 화면은 기능만 동작한다. Stitch 시안 기준으로 다시 만들되 `CLAUDE.md` 의
"반드시 살아남아야 하는 동작" 표를 체크리스트로 쓴다. **하나라도 빠뜨리면 안 된다.**

### P2-1 디자인 토큰·레이아웃 셸 · 5h
- **완료 조건** `app/globals.css` 의 `@theme` 에 색·간격·타이포 토큰 / 하단 고정 탭바 / safe-area 반영 / 320px 무스크롤 / 커스텀 오프라인 화면
- **에이전트** `ui-builder`

### P2-2 인증 4화면 · 8h
- **완료 조건** login·register·reset·reset/confirm 시안 반영 / 4가지 상태(로딩·정상·빈·에러) / 44px 터치 타깃 / label 연결·aria-describedby 에러 / 계정 열거 방지 문구 유지

### P2-3 검색 입력 화면 · 8h
- **완료 조건** 시안 반영 / **디바운스 250ms 유지** / 출발↔도착 스왑 / 최근 검색 / 현재 위치 / 수도권 밖 사전 안내 유지

### P2-4 경로 목록 화면 · 7h
- **완료 조건** 시안 반영 / **정렬 4종 유지** / **펼치면 `/api/transit/select` 호출 유지** / **데이터 기준 시각 표시 유지** / 빈 결과와 오류 구분 / 로딩 스켈레톤 / 3분 이하 도보 칩 생략

### P2-5 화면 E2E · 2h
- **완료 조건** ①가입→로그인→로그아웃 ②검색→목록→상세 진입 이 Playwright(모바일 뷰포트)에서 통과. 외부 API는 `page.route()` 로 fixture 응답.

---

## P3 — 멀티모달 조합 엔진 (10/12–10/18, 15h)

ODsay가 조합 경로를 주지 않으므로 직접 만든다. **프로젝트의 핵심 리스크.**
새 코드는 `lib/routing/` 에 두고 `lib/routes.ts` 의 도메인 타입만 쓴다.

### P3-1 후보 생성 · 6h
- **완료 조건** 좌표쌍에서 도보+대중교통 후보 N개 생성 / 도보만 가능한 짧은 거리 / 후보 없음 / 수도권 밖
- **테스트** 동일 출도착, 환승 0회, 도보 거리, 후보 없음 — 각각

### P3-2 열등 후보 제거 · 4h
- **완료 조건** 같은 수단인데 더 느리고 환승도 많은 후보를 제거. 제거 근거를 응답에 남긴다.

### P3-3 요금·시간 계산 · 5h
- **완료 조건** 환승 할인 반영 / 도보 속도를 상수로 분리 / 계산 근거를 응답에 포함
- **테스트** 순수 함수 전부

---

## P4 — 경로 상세 화면 (10/19–10/25, 15h)

### P4-1 구간 타임라인 · 8h
- **완료 조건** 도보/승차/환승/하차 구간별 소요시간·거리 / 수단별 색 구분 / 접근 가능한 이름 부여 / 4가지 상태

### P4-2 상세에서의 선택 기록 · 3h
- **완료 조건** 상세 진입도 `/api/transit/select` 로 기록되어 KPI 선택률이 정확해짐. 중복 기록 방지.

### P4-3 상세 테스트 · 4h
- **완료 조건** 구간 포매터 단위 테스트 + 상세 진입 E2E

---

## P5 — 카카오맵 (10/26–11/01, 15h)

### P5-1 SDK 로드 · 5h
- **완료 조건** JS 키만 클라이언트 / 등록 도메인 설정 / **SDK 로드 실패해도 화면이 동작** / 앱은 계정당 하나만 사용

### P5-2 노선 그리기 · 6h
- **완료 조건** ODsay 노선 그래픽 좌표열을 폴리라인으로 / 수단별 색 / 전체 경로가 보이도록 뷰포트 자동 조정

### P5-3 지도 성능 · 4h
- **완료 조건** 지도 스크립트가 첫 화면 LCP를 늦추지 않음 (상세 화면에서만 로드)

---

## P6 — 안정화·배포 (11/02–11/06, 15h)

### P6-1 하이브리드 대비 전수 점검 · 4h
- **완료 조건** 전 화면 safe-area / 44px 터치 타깃 / 하단 탭바 / 오프라인 화면 / 320px 무스크롤

### P6-2 에러·로깅 정리 · 3h
- **완료 조건** 사용자에게는 일반화 메시지, 원인은 서버 로그에만 / 로그에 비밀값·이메일 전문 없음 / 미처리 예외 경계

### P6-3 성능 · 3h
- **완료 조건** 첫 화면 LCP 측정 / 번들에 서버 전용 코드가 없는지 확인 / 캐시 히트율 측정

### P6-4 배포 · 5h
- **완료 조건** 배포 환경 결정 / **ODsay는 고정 IP가 필요하다 — 서버리스면 사전 확인 필수** / 배포 IP 등록 / 프로덕션 `DATABASE_URL` 이 `moveone_app` 인지 확인 / 배포본에서 전체 흐름 1회 통과

---

## 발견한 것 (범위 밖이라 미룬 것)
작업 중 발견했지만 티켓 범위가 아닌 것을 여기에 한 줄씩 적는다.

-
