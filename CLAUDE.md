# MoveOne — 수도권 대중교통 경로 검색

이 파일은 매 세션 자동으로 읽힙니다. 아래 결정들은 이미 검토를 거친 것이므로
다시 뒤집지 말고, 바꿔야 할 이유가 생기면 먼저 사용자에게 물어보세요.

## 환경

- Next.js 16 (App Router, TypeScript), Node 24, **pnpm 고정** (npm·yarn 금지)
- 개발 서버 포트 **4100**, Postgres 포트 **5433** (같은 PC의 다른 프로젝트와 충돌 회피)
- 스타일은 **Tailwind v4** (`@import "tailwindcss"` + `@theme`). `tailwind.config.js`는 쓰지 않습니다
- 새 의존성을 추가하기 전에 **반드시 먼저 물어볼 것**. 이 프로젝트는 의존성을 최소로 유지합니다

## 명령

```bash
./scripts/start.sh                    # DB 확인 + 개발 서버 (http://localhost:4100)
./scripts/shutdown.sh                 # Ctrl-C 로 안 죽었을 때
./scripts/shutdown.sh --all --db      # 리포의 남은 node + DB 까지
pnpm test                             # vitest — API 키 없이 통과해야 정상
docker compose exec -T db psql -U app -d moveone < db/schema.sql        # 스키마
docker compose exec -T db psql -U app -d moveone < db/002_security.sql  # 보안 계층
docker compose exec -T db psql -U app -d moveone < db/003_consent.sql   # 동의 기록

./scripts/secure-init.sh              # 한 번만 — .gitignore·커밋 차단 훅·파일 권한
./scripts/audit-secrets.sh            # 아무 때나 — 키가 샜는지 점검만
```

`pnpm dev` 대신 `./scripts/start.sh` 를 쓰세요. WSL + Turbopack 에서 Ctrl-C 가
Next 를 못 죽이고 포트 4100 이 물린 채 남는 일이 있습니다. start.sh 는 Ctrl-C 를
직접 받아 **프로세스 트리 전체**를 정리하고, 그래도 안 풀리면 포트를 잡은
프로세스를 찾아 끝냅니다. 뜰 때도 남아 있는 프로세스를 먼저 치웁니다.

## 범위 — 1차에 하지 않는 것

유저플로우 **s1(인증) + s2(경로 검색)**, 이동수단은 **대중교통 + 도보**,
지역은 **수도권(서울·경기·인천)** 만입니다.

아래는 선행 조건이 없어 1차 범위 밖입니다. 요청받지 않았다면 만들지 마세요.

- 예약·결제 (제휴 계약 선행)
- 실시간 지연·대체 경로 (공공데이터포털 연동이 2차)
- 이용 이력·영수증·환불
- 운영자 대시보드
- 택시·따릉이·킥보드 조합 경로 (조합 엔진은 2차 핵심 과제)
- 접근성 경로 (엘리베이터 데이터 미확보)

## 아키텍처에서 반드시 지킬 것

### 1. ODsay 의존은 `lib/odsay/` 안에만 둡니다

화면과 API 라우트는 `lib/routes.ts`의 도메인 타입(`TransitRoute`, `RouteSegment`)만
압니다. ODsay 응답 형식이 화면까지 올라오면 안 됩니다.

- ODsay 응답 구조가 바뀌면 → `lib/odsay/types.ts`와 `normalize.ts`만 고칩니다
- 2차에서 따릉이·택시를 넣을 때 → `SegmentType`에 값을 추가합니다

### 2. 시각은 `timestamptz`(UTC)로 저장하고, 표시할 때만 KST로 바꿉니다

변환은 `lib/kst.ts`에서만 합니다. DB나 코드에 KST를 문자열로 넣지 마세요.
`DATETIME`처럼 시간대 없는 타입은 쓰지 않습니다.

### 3. 캐시 테이블을 사용자 테이블이 FK로 참조하지 않습니다

`transit_stations`, `transit_routes`, `route_cache`는 외부에서 받아와 채우는
데이터라 언제든 비울 수 있어야 합니다. 정류장 이름·좌표가 필요하면 ID가 아니라
**값을 복사해** 둡니다 (`search_route_segments`가 그렇게 되어 있습니다).

### 4. API 키는 서버에만 둡니다

- `ODSAY_API_KEY`, `KAKAO_REST_API_KEY` → 서버 전용. 클라이언트 컴포넌트에서
  import하면 안 됩니다 (`lib/odsay/client.ts` 맨 위의 `import "server-only"`가 막습니다)
- `NEXT_PUBLIC_KAKAO_JS_KEY` → 브라우저에 나가도 됩니다. 등록 도메인에서만 동작합니다
- 브라우저가 ODsay를 직접 호출하는 코드를 절대 만들지 마세요
- `.githooks/pre-commit` 이 비밀값 커밋을 막습니다. 일부러 넣은 값이면 그 줄 끝에
  `# secret-ok` 를 붙이세요. 키 교체 절차와 배포 시 키 관리는 `docs/SECURITY-KEYS.md`

### 5. DB 접근은 `lib/db.ts`의 `query()`로만, 항상 `$1,$2` 바인딩

문자열 이어붙이기 금지.

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
| 장소 검색이 실패하면 **이유를 표시** | 조용히 넘어가면 검색 버튼이 고장난 것처럼 보입니다 |
| 검색 버튼이 비활성인 이유를 아래에 표시 | 목록에서 선택해야 활성화된다는 걸 알 길이 없습니다 |
| 교통수단을 캐시 키에 포함 | 안 넣으면 "지하철만"이 직전 "전체" 결과를 돌려줍니다 |

## 구조

```
app/
  page.tsx                    메인 대시보드 (로그인 필요)
  login|register|reset/       인증 화면
  account/                    회원 정보 · 로그아웃 (RLS 가 도는지 확인하기 좋은 자리)
  search/page.tsx             경로 검색 입력   + search-form.tsx (클라이언트)
  search/result/              경로 후보 목록   + result-view.tsx
  route/detail/               경로 상세·지도   + detail-view.tsx
  legal/{terms,privacy}/      이용약관·개인정보 처리방침 (로그인 없이 열림)
  wallet/                     패스·지갑 (결제수단 자리 — 아직 비어 있음)
  error/data/                 데이터 오류·오프라인
  api/transit/search/route.ts 경로 검색 프록시 — 지역판정→캐시→ODsay→정규화→기록
  api/transit/lane/route.ts   노선 선형 조회 (loadLane) — 상세에서만, 24시간 캐시
  api/transit/select/route.ts 경로 선택 기록 (KPI)
  api/places/route.ts         카카오 장소 검색 프록시
  api/auth/                   register·login·logout·reset/{request,confirm}
components/
  app-chrome.tsx              Shell·헤더·탭바·배너·폼 조각   ← 새 화면은 여기서 시작
  route-map.tsx               카카오맵 (버스가 섞인 경로)
  subway-map.tsx              ODsay 지하철 노선도 (지하철 전용 경로)
  icon.tsx                    Material Symbols
lib/
  odsay/{types,client,normalize}.ts   ODsay 경계
  routes.ts                   도메인 타입·정렬·포매터   ← 가장 오래 살아남을 파일
  auth-guard.ts               requireSession / redirectIfSignedIn
  search-store.ts             화면 사이 결과 전달 (sessionStorage)
  consent.ts                  약관 버전·동의 기록 읽기/쓰기
  cache.ts, region.ts, db.ts, session.ts, password.ts, kst.ts, mailer.ts
types/kakao-maps.d.ts         카카오맵 SDK 최소 타입 선언
types/odsay-subway.d.ts       ODsay 노선도 SDK 최소 타입 선언
db/schema.sql                 11개 테이블 · 002_security.sql 보안 · 003_consent.sql 동의
fixtures/odsay/               응답 샘플. 테스트가 여기를 읽습니다
```

## 진입과 보호

`/` 는 세션이 없으면 `/login` 으로 보냅니다. 앱 화면은 서버 컴포넌트 첫 줄에서
`requireSession()` 을 부릅니다. 미들웨어를 쓰지 않는 이유는 세션 서명이
`node:crypto` 의 `createHmac` 을 쓰는데 미들웨어가 엣지 런타임이기 때문입니다.

검색 → 목록 → 상세는 `sessionStorage`(`lib/search-store.ts`)로 결과를 넘깁니다.
좌표를 URL 에 남기지 않고 ODsay 호출도 아끼려는 선택입니다. 결과 링크를 공유해야
할 일이 생기면 그때 쿼리 방식으로 바꾸세요.

## 지도 — ODsay 가 데이터, 카카오맵이 도구

ODsay 가이드(lab.odsay.com/guide/guide#guideWeb_1)의 3단계를 그대로 따릅니다.

```
1) searchPubTransPathT   경로 후보 + info.mapObj      app/api/transit/search
2) loadLane(mapObj)      실제 노선 선형 graphPos      app/api/transit/lane
3) 카카오맵 Polyline      그리기                      components/route-map.tsx
```

**경로 데이터는 전부 ODsay 가 만듭니다.** 카카오는 두 군데에서만 쓰입니다 —
입력한 글자를 좌표로 바꾸는 Local API(`app/api/places`)와, 그 선을 그리는 JS SDK.

- `loadLane` 은 **경로 상세에서만** 부릅니다. 검색 결과 전체에 미리 부르면 경로
  개수만큼 호출이 늘어나는데 사용자는 보통 하나만 열어봅니다
- 선형은 거의 안 바뀌므로 **24시간 캐시**합니다 (`laneCacheKey`, `LANE_TTL_MINUTES`)
- `/api/transit/lane` 은 **로그인 사용자만** 부를 수 있습니다. 열어두면 남의 키로
  ODsay 한도를 태우는 공개 프록시가 됩니다
- ODsay 는 x 가 경도, y 가 위도입니다. 카카오맵은 (위도, 경도) 순서라
  `normalizeLanes()` 에서 뒤집습니다. 안 뒤집으면 선이 서해에 그려집니다
- **지도는 없어도 되는 것으로 유지하세요.** 키가 없거나 SDK 가 막히거나 loadLane 이
  실패해도 화면은 동작해야 합니다. 선형을 못 받으면 정차역을 이은 선으로 물러서고,
  그때는 "정류장을 이은 대략 경로입니다" 라고 지도 위에 밝힙니다
- `NEXT_PUBLIC_KAKAO_JS_KEY` 는 서버 컴포넌트(`app/route/detail/page.tsx`)에서 읽어
  props 로 내려보냅니다. 클라이언트 컴포넌트가 직접 `process.env` 를 읽지 않습니다

## 지하철 노선도 — 지하철 전용 경로는 지도가 아니라 노선도

ODsay 가 2026-05-28 에 **JavaScript 지하철 노선도 API** 를 추가했습니다
(lab.odsay.com/guide/subwayMapDemo). 지하철만으로 가는 경로는 지리 지도보다
노선도가 낫습니다 — 환승역이 한눈에 들어오고, 도로 위에 그려진 선을 보고
헷갈릴 일이 없습니다.

```js
<script src="https://api.odsay.com/v1/api/subway/sdk.js?apiKey=…&callback=…">
new odsay.maps.Subway(div, { lang: 0, CID: 1000 })   // CID 1000 = 수도권
map.addMarker("s", 출발역ID)   // s=출발 m=경유 e=도착
map.addMarker("e", 도착역ID)   // 둘 다 찍히면 노선도가 스스로 경로를 그립니다
map.addEvent("path_changed", cb)
```

**키가 두 개입니다. 같은 값을 쓰면 한쪽이 반드시 실패합니다.**

| 키 | 쓰는 곳 | 등록 방식 |
| --- | --- | --- |
| `ODSAY_API_KEY` | 서버 — 경로 검색·loadLane | Server 플랫폼 + 공인 IP |
| `NEXT_PUBLIC_ODSAY_WEB_KEY` | 브라우저 — 노선도 SDK | Web 플랫폼 + 도메인 |

- 역 ID 는 `subPath[].startID` / `endID` 입니다. `normalize.ts` 가 문자열로
  보관하고 `components/subway-map.tsx` 가 숫자로 되돌립니다
- 버스가 섞이면 노선도로 표현할 수 없으므로 카카오 지도를 씁니다.
  판정은 `MapArea`(`app/route/detail/detail-view.tsx`) 에 있습니다
- 노선도는 **자기 경로를 스스로 찾습니다.** 우리가 보여준
  searchPubTransPathT 결과와 다를 수 있습니다. 다르면 `path_changed` 로그와
  화면을 비교해 보세요

## 화면 상태 — 효과 안에서 setState 하지 않습니다

Next 16 의 `eslint-config-next` 는 React 컴파일러 규칙을 켭니다. 아래 두 가지가
오류로 잡히므로, 새 화면을 만들 때 처음부터 이 방식으로 쓰세요.

| 하지 말 것 | 대신 |
| --- | --- |
| `useEffect(() => setX(loadSearch()), [])` | `useStoredSearch()` / `useRecent()` (`lib/search-store.ts`) |
| 렌더 본문에서 `Date.now()` | `useNow()` (`lib/use-now.ts`) |
| 효과 안에서 곧바로 `setX(...)` 로 초기화 | `useState` 초기값, 또는 부모가 `key` 로 새로 시작 |

`sessionStorage` 와 시계는 React 바깥의 외부 시스템입니다. 정식 도구는
`useSyncExternalStore` 이고, 위 훅들이 그것을 감싼 것입니다. 스냅샷은 **값이
같으면 참조도 같아야** 하므로 원문 문자열을 키로 캐시합니다. 이 캐시를 빼면
렌더가 무한히 반복됩니다.

저장소를 읽는 훅은 세 상태를 구분합니다 — `undefined`(아직 모름, 스켈레톤),
`null`(없음, `/search` 로 되돌림), 값. 두 가지로 줄이면 결과가 있는데도
"없음" 화면이 한 번 스칩니다.

효과에는 **밖으로 내보내는 일**만 남깁니다 — 화면 이동, 로그, fetch.
비동기 콜백 안의 `setState` 는 규칙에 걸리지 않습니다.

## 약관 동의

문서는 `app/legal/` 에 있고, **버전은 `lib/consent.ts` 의 상수**입니다.

- 문서를 고치면 `TERMS_VERSION` / `PRIVACY_VERSION` 을 **반드시 같이 올리세요.**
  올리지 않으면 바뀐 문서에 옛 동의가 붙어 있는 상태가 됩니다
- 동의는 `user_consents` 에 **쌓입니다.** 덮어쓰거나 지우지 마세요 —
  "언제 동의했고 언제 철회했는지" 가 이 테이블의 존재 이유입니다.
  그래서 UPDATE·DELETE 정책을 일부러 만들지 않았습니다 (= 전면 차단)
- 가입 시점에는 세션이 없어 RLS 를 통과할 수 없으므로
  `record_user_consents()` (SECURITY DEFINER) 를 씁니다. 이 함수는 "가입 직후
  10분 이내" 계정에만 익명 기록을 허용합니다
- 처리방침 내용은 **실제 코드가 하는 일**과 맞춰 적혀 있습니다. 수집 컬럼이나
  외부 연동(ODsay·카카오로 좌표·검색어가 나갑니다)을 바꾸면 문서도 고치세요
- `<Blank>` 로 표시된 자리(보호책임자·사업자 정보)는 서비스 오픈 전 필수

## 로그

`console.log` 를 직접 쓰지 마세요. `lib/logger.ts` 의 `log.debug / log.info / log.error`
를 씁니다. 브라우저와 서버가 같은 형식으로 찍혀 한 줄로 이어 볼 수 있습니다.

```
[MoveOne 17:22:31.481 client] DEBUG 클릭 { name: 'search.submit', tag: 'button' }
[MoveOne 17:22:31.502 server] DEBUG api.transit.search 시작 { mode: 'subway' }
[MoveOne 17:22:32.640 server] INFO  api.transit.search 완료 1138ms { routes: 3, fromCache: false }
```

레벨은 `.env.local` 의 `NEXT_PUBLIC_LOG_LEVEL` 하나로 바꿉니다 —
`debug`(기본) / `info` / `error` / `silent`. 값이 빌드 시점에 박히므로 바꾸면
개발 서버를 재시작해야 합니다. 운영에서는 `error` 로 둡니다.

- 무엇을 찍나: 화면 이동, 클릭·엔터, 장소 선택, 검색 요청과 결과, 캐시 적중,
  정렬 변경, 경로 선택(KPI), 지도 로드, 잡히지 않은 예외
- 사용자 동작은 `components/action-logger.tsx` 가 layout 에서 한 번에 잡습니다.
  개별 컨트롤에 `data-log="이름"` 을 붙이면 그 이름으로 찍힙니다
- **입력값과 좌표는 찍지 않습니다.** 로거의 `redact()` 가 pass·token·session·
  auth·email 이 들어간 키를 자동으로 가리지만, 애초에 넘기지 않는 것이 맞습니다
- `console` 사용은 ESLint 가 `lib/logger.ts` 와 `lib/mailer.ts` 에서만 허용합니다.
  mailer 는 개발 모드에서 메일을 터미널에 상자 모양으로 찍는데, 비밀번호 재설정
  링크를 눈으로 찾아 눌러야 해서 그 모양이 유지되어야 합니다

## 테스트

`pnpm test`는 **ODsay를 호출하지 않습니다.** `fixtures/odsay/*.json`을 읽습니다.
실제 응답을 받으면 fixture를 교체하세요. 구조가 달라졌으면 테스트가 실패해서 알려줍니다.

순수 함수(정규화·정렬·포매터·지역판정)는 테스트를 먼저 쓰고 고칩니다.

## 작업 방식

- 코드를 고치면 `git diff`로 무엇이 바뀌었는지 사용자가 확인합니다. 의도하지 않은
  파일을 건드리지 마세요
- 한 덩어리가 끝나면 커밋합니다. `feat:` `fix:` `refactor:` `chore:` `docs:` 접두어
- 타입·린트·테스트를 전부 통과시킨 뒤 완료라고 보고하세요
