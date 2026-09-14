# MoveOne — 수도권 대중교통 경로 검색

이 파일은 매 세션 자동으로 읽힙니다. 아래 결정들은 이미 검토를 거친 것이므로
다시 뒤집지 말고, 바꿔야 할 이유가 생기면 먼저 사용자에게 물어보세요.

## 환경

- Next.js 16 (App Router, TypeScript), Node 24, **pnpm 고정** (npm·yarn 금지)
- 개발 서버 포트 **4100**, Postgres 포트 **5433** (같은 PC의 my-project와 충돌 회피)
- 스타일은 **Tailwind v4** (`@import "tailwindcss"` + `@theme`). `tailwind.config.js`는 쓰지 않습니다
- 새 의존성을 추가하기 전에 **반드시 먼저 물어볼 것**. 이 프로젝트는 의존성을 최소로 유지합니다

## 명령

```bash
docker compose up -d      # DB (compose.yaml, 5433). schema.sql·002_security.sql 자동 적용
pnpm dev                  # http://localhost:4100
pnpm test                 # vitest — API 키 없이 통과해야 정상
pnpm verify               # typecheck → lint → test → build. 커밋 전 필수
pnpm test:e2e             # playwright. 화면을 건드린 티켓에서만
```

## 규칙 파일

세부 규칙은 `.claude/rules/` 에 나뉘어 있고 자동으로 로드됩니다. 여기서 다시 import하지 않습니다.

| 파일 | 다루는 것 | 로드 |
|---|---|---|
| `00-project.md` | 1차 범위·제외 범위·확인된 제약 | 항상 |
| `10-stack.md` | 구조·코드 규약 | 항상 |
| `20-security.md` | 비밀값·인증·RLS·메일 (타협 불가) | 항상 |
| `30-testing.md` | 무엇을 테스트하고 무엇을 안 하는가 | 항상 |
| `40-git.md` | 브랜치·worktree·커밋 | 항상 |
| `50-external-api.md` | ODsay·카카오 연동 | `lib/odsay/**`, `lib/kakao/**`, `app/api/**` |
| `60-mobile-ui.md` | 모바일 웹·하이브리드 대비·접근성 | `app/**`, `components/**` |

## 아키텍처에서 반드시 지킬 것

### 1. ODsay 의존은 `lib/odsay/` 안에만 둡니다

화면과 API 라우트는 `lib/routes.ts`의 도메인 타입(`TransitRoute`, `RouteSegment`)만
압니다. ODsay 응답 형식이 화면까지 올라오면 안 됩니다.

- ODsay 응답 구조가 바뀌면 → `lib/odsay/types.ts`와 `normalize.ts`만 고칩니다
- 2차에서 따릉이·택시를 넣을 때 → `SegmentType`에 값을 추가합니다

### 2. 시각은 `timestamptz`(UTC)로 저장하고, 표시할 때만 KST로 바꿉니다

변환은 `lib/kst.ts`에서만 합니다. DB나 코드에 KST를 문자열로 넣지 마세요.
시간대 없는 타입은 쓰지 않습니다.

### 3. 캐시 테이블을 사용자 테이블이 FK로 참조하지 않습니다

`transit_stations`, `transit_routes`, `route_cache`는 외부에서 받아와 채우는
데이터라 언제든 비울 수 있어야 합니다. 정류장 이름·좌표가 필요하면 ID가 아니라
**값을 복사해** 둡니다 (`search_route_segments`가 그렇게 되어 있습니다).

### 4. API 키는 서버에만 둡니다

- `ODSAY_API_KEY`, `KAKAO_REST_API_KEY` → 서버 전용. 클라이언트 컴포넌트에서
  import하면 안 됩니다 (`lib/odsay/client.ts` 맨 위의 `import "server-only"`가 막습니다)
- `NEXT_PUBLIC_KAKAO_JS_KEY` → 브라우저에 나가도 됩니다. 등록 도메인에서만 동작합니다
- 브라우저가 ODsay를 직접 호출하는 코드를 절대 만들지 마세요

### 5. DB 접근은 `lib/db.ts`의 `query()`로만, 항상 `$1,$2` 바인딩

문자열 이어붙이기 금지. `DATABASE_URL`은 반드시 `moveone_app` 역할입니다
(`app`은 슈퍼유저라 RLS를 통째로 우회합니다).

### 6. 외부 API 응답은 방어적으로 다룹니다

필드가 없어도 예외를 던지지 않습니다. `normalize.ts`의 방식을 따르세요.

## 화면을 고칠 때 반드시 살아남아야 하는 동작

와이어프레임에는 보통 안 적혀 있지만, 빠지면 제품이 망가지는 것들입니다.
화면을 다시 만들 때 이 목록을 체크리스트로 쓰세요.

| 동작 | 이유 |
| --- | --- |
| 장소 입력 **디바운스 250ms** | 타이핑마다 호출하면 카카오 한도를 낭비합니다 |
| 경로를 펼치면 `/api/transit/select` 호출 | 기획서 KPI **선택률 40%** 의 유일한 근거. 빠지면 지표가 0이 됩니다 |
| **데이터 기준 시각** 표시 | 기획서 수락기준 항목 |
| 빈 결과와 오류를 **구분해서** 안내 | "경로 없음"과 "API 실패"는 사용자 대응이 다릅니다 |
| 로딩 스켈레톤 | ODsay 응답이 1초 이상 걸립니다. 빈 화면은 고장으로 보입니다 |
| 3분 이하 도보 구간은 요약 칩에서 생략 | 칩이 지저분해집니다 |
| 정렬 4종 (빠른·저렴한·환승적은·도보적은) | 기획서 수락기준 항목. `sortRoutes()`를 쓰세요 |
| 수도권 밖이면 검색 전에 안내 | `lib/region.ts`. ODsay 호출을 아끼고 사용자에게 친절합니다 |

## 구조

```
app/
  page.tsx                    검색 화면 (서버 컴포넌트)
  route-search.tsx            검색 UI (클라이언트)
  login|register|reset/       인증 화면
  api/transit/search/         경로 검색 프록시 — 지역판정→캐시→ODsay→정규화→기록
  api/transit/select/         경로 선택 기록 (KPI)
  api/places/                 카카오 장소 검색 프록시
  api/auth/                   register·login·logout·reset/{request,confirm}
lib/
  odsay/{types,client,normalize}.ts   ODsay 경계
  routes.ts                   도메인 타입·정렬·포매터   ← 가장 오래 살아남을 파일
  cache.ts region.ts db.ts session.ts password.ts kst.ts mailer.ts reset-token.ts
  __tests__/                  단위 테스트
db/schema.sql                 11개 테이블
db/002_security.sql           역할 분리·이메일·잠금·재설정 토큰·RLS
fixtures/odsay/               응답 샘플. 테스트가 여기를 읽습니다
tests/e2e/                    Playwright
```

## 작업 방식

- 티켓 단위로 작업합니다. 목록은 `docs/TICKETS.md`, 착수는 `/ticket <ID>`.
- 한 티켓 = 한 브랜치 = 한 worktree = 한 PR. 생성은 `./scripts/wt.sh new <ID> <슬러그>`.
- 코드를 고치면 `git diff`로 무엇이 바뀌었는지 사용자가 확인합니다. 의도하지 않은
  파일을 건드리지 마세요.
- `pnpm verify`를 통과시킨 뒤 완료라고 보고하세요. Stop 훅이 자동으로 확인합니다.
- 커밋·푸시는 사용자가 명시적으로 요청할 때만 합니다.
