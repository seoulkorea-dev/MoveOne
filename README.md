# MoveOne — 수도권 대중교통 경로 검색

1차 범위: 유저플로우 **s1(인증) + s2(경로 검색)**, 이동수단은 **대중교통 + 도보**,
서비스 지역은 **수도권(서울·경기·인천)**.

```
브라우저 ──▶ MoveOne 서버 ──▶ ODsay (경로)
                         └─▶ 카카오 Local (주소→좌표)
              API 키는 서버에만 있습니다
```

---

## 설치

기존 `my-project`와 같은 Node 24 / pnpm / Docker 환경을 씁니다.

```bash
cd ~/projects
pnpm create next-app@latest MoveOne
```

질문 답: TypeScript **Yes** · ESLint **Yes** · Tailwind **No** · `src/` **No** ·
App Router **Yes** · 나머지 기본값.

```bash
cd MoveOne
unzip -o /mnt/c/Users/Admin/Downloads/MoveOne.zip     # 이 압축을 덮어씁니다
pnpm add pg
pnpm add -D @types/pg vitest
```

`package.json`의 스크립트를 이렇게 맞춥니다.

```json
"dev": "next dev -p 4100",
"test": "vitest run",
"test:watch": "vitest"
```

> 포트를 4100으로 둔 이유: 기존 `my-project`가 4000을 쓰고 있어 충돌을 피합니다.
> DB도 같은 이유로 5433을 씁니다.

## 실행

```bash
docker compose up -d
sleep 8 && docker compose ps          # healthy 확인

cp .env.local.example .env.local
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')|" .env.local
code .env.local                        # ODSAY_API_KEY, KAKAO_REST_API_KEY 채우기

pnpm test                              # API 키 없이도 통과합니다
pnpm dev                               # http://localhost:4100
```

`pnpm test`가 먼저 통과하는지 확인하세요. **API 키가 없어도 통과합니다** —
저장된 응답 샘플로 검증하기 때문입니다.

---

## API 키 준비

### ODsay

콘솔에서 **Server 플랫폼에 공인 IP를 등록**해야 합니다. Android/iOS 키로는
웹앱이 동작하지 않습니다.

```bash
curl ifconfig.me      # 이 IP를 ODsay 콘솔에 등록
```

URI와 IP는 각각 5개까지 등록됩니다. 배포 시에는 고정 IP가 필요하므로,
서버리스(Vercel 등)에 올릴 계획이면 ODsay에 대응 방법을 먼저 문의하세요.

### 카카오

`developers.kakao.com`에서 **애플리케이션을 하나만** 만드세요.
2026-07-21 정책 변경으로 계정의 첫 번째 앱만 무료 쿼터를 받습니다.
플랫폼 → Web에 `http://localhost:4100`을 등록합니다.

키가 두 종류이고 성격이 다릅니다.

| 키 | 위치 | 노출 |
| --- | --- | --- |
| REST API 키 | `KAKAO_REST_API_KEY` — 서버 전용 | 안 됨 |
| JavaScript 키 | `NEXT_PUBLIC_KAKAO_JS_KEY` — 브라우저 | 됨 (등록 도메인에서만 동작) |

---

## 구조

```
app/
  page.tsx                    검색 화면 (서버 컴포넌트)
  route-search.tsx            검색 UI (클라이언트) — 자동완성·정렬·상세
  login/, register/           인증 화면
  api/
    transit/search/route.ts   ★ 경로 검색 프록시 (지역판정→캐시→ODsay→정규화→기록)
    transit/select/route.ts   경로 선택 기록 (KPI 선택률)
    places/route.ts           카카오 장소 검색 프록시
    auth/{login,register,logout}
lib/
  odsay/types.ts              ODsay 원본 응답 타입
  odsay/client.ts             서버 전용 호출 + 오류 변환
  odsay/normalize.ts          ★ 원본 → 도메인 타입 (완충 지대)
  routes.ts                   ★ 도메인 타입 + 정렬 + 포매터
  cache.ts                    경로 캐시 + API 호출 로그
  region.ts                   수도권 경계 판정
  db.ts, session.ts, password.ts, kst.ts
db/schema.sql                 11개 테이블 (Postgres)
fixtures/odsay/               응답 샘플 — 테스트가 여기를 읽습니다
```

★ 표시가 오래 살아남을 코드입니다.

### 설계에서 지킨 것

**ODsay 의존을 `lib/odsay/` 안에만 가둡니다.** 화면은 `lib/routes.ts`의 도메인
타입만 압니다. ODsay가 필드를 바꾸면 `normalize.ts`만 고치면 되고, 2차에서
따릉이·택시 구간을 끼워넣을 때도 `SegmentType`에 값을 추가하는 것으로 끝납니다.

**시각은 `timestamptz`(UTC)로 저장하고 표시할 때만 KST로 바꿉니다.**
Notion 정의서의 `DATETIME`을 그대로 쓰면 서버 위치가 바뀔 때 값이 전부 틀어집니다.

**캐시 테이블을 사용자 테이블이 FK로 참조하지 않습니다.**
`transit_stations`는 언제든 비우고 다시 채울 수 있어야 합니다. 정류장 이름과
좌표는 `search_route_segments`에 값으로 복사해 둡니다.

**`station_external_ids`를 미리 만들어 둡니다.** ODsay와 공공데이터포털은
정류장 ID 체계가 다릅니다. 2차에서 실시간 도착정보를 붙일 때 필요합니다.

---

## 확인

```bash
# 검색 기록이 쌓이는지
docker compose exec db psql -U app -d moveone -c \
  "select id, result_count, selected_route_id, cache_hit,
          created_at at time zone 'Asia/Seoul' as kst
     from searches order by id desc limit 5;"

# 캐시가 동작하는지 — 같은 경로를 두 번 검색한 뒤
docker compose exec db psql -U app -d moveone -c \
  "select provider, count(*) 호출, count(*) filter (where cache_hit) 캐시적중 from api_logs group by provider;"

# KPI — 검색 완료율과 선택률
docker compose exec db psql -U app -d moveone -c \
  "select count(*) 검색수,
          round(100.0*count(*) filter (where result_count>0)/nullif(count(*),0),1) 완료율,
          round(100.0*count(selected_route_id)/nullif(count(*),0),1) 선택률
     from searches;"
```

---

## 보안

### 계정 잠금 — 5회 실패 시

비밀번호를 5회 틀리면 계정이 잠깁니다. **시간이 지나도 자동으로 풀리지
않습니다.** 이메일로 비밀번호를 재설정해야 해제됩니다.

시간 기반 잠금(10분 뒤 해제)보다 강한 방식입니다. 공격자가 10분씩 기다리며
계속 시도하는 것을 막고, 정상 사용자에게는 "재설정"이라는 명확한 다음 행동이
주어집니다.

- 실패 횟수는 `user_auth.failed_attempts`, 잠금은 `locked_at`
- 로그인에 한 번 성공하면 카운터가 0으로 초기화됩니다
- 모든 시도는 `login_attempts` 에 남습니다 (성공·실패·존재하지 않는 아이디 모두)

### 비밀번호 재설정

`/reset` 에서 이메일을 입력하면 링크를 보냅니다. **개발 중에는 실제로
발송되지 않고 서버 터미널에 링크가 출력됩니다** (`MAIL_TRANSPORT=console`).

- 토큰은 256비트 난수. DB에는 **SHA-256 해시만** 저장합니다
- 30분 유효, 1회용. 새로 요청하면 이전 토큰은 즉시 무효화됩니다
- 등록된 이메일이든 아니든 **같은 화면**을 보여줍니다 — 어떤 이메일이
  가입돼 있는지 알아내는 것(계정 열거)을 막기 위해서입니다
- 재설정 성공 시 잠금과 실패 카운터가 함께 풀립니다

실제 발송이 필요해지면 `lib/mailer.ts` 의 `sendViaSmtp` 만 채우면 됩니다.
호출부는 바꾸지 않습니다.

### RLS (행 수준 접근 제어)

`users`, `user_auth`, `user_preferences`, `searches`, `password_reset_tokens`
에 정책이 걸려 있습니다. 애플리케이션이 `where user_id = $1` 을 빠뜨려도
DB가 남의 행을 돌려주지 않습니다.

**반드시 지켜야 할 것 두 가지가 있습니다.**

1. **애플리케이션은 `moveone_app` 역할로 접속해야 합니다.**
   `app` 은 슈퍼유저이고, 슈퍼유저는 RLS를 통째로 우회합니다.
   `DATABASE_URL` 이 `app` 을 가리키면 정책이 하나도 동작하지 않습니다.
   마이그레이션만 `app` 으로 실행합니다.

2. **사용자 데이터는 `withUser()` 로 조회합니다.**

```ts
import { withUser } from "@/lib/db";

const rows = await withUser(session.uid, (q) =>
  q("select * from searches order by created_at desc limit 20")
);
```

`query()` 로 RLS 테이블을 조회하면 아무것도 안 나옵니다. 버그가 아니라
컨텍스트가 없어서입니다. `SET LOCAL` 은 트랜잭션 안에서만 유효하므로
`withUser()` 가 커넥션을 잡고 트랜잭션으로 감쌉니다.

인증·가입·재설정은 사용자를 알기 전에 일어나므로 `SECURITY DEFINER`
함수(`auth_lookup_local`, `register_local_user`, `confirm_password_reset` 등)
로만 좁게 열어 두었습니다.

### 검증

정책은 "넣었다"가 아니라 "실제로 막는다"를 확인해야 합니다.

```bash
docker compose exec -T db psql -U moveone_app -d moveone \
  -v ON_ERROR_STOP=1 -f - < db/test-security.sql
```

30개 항목을 검사합니다 — 컨텍스트 없이 조회했을 때 0건인지, `where` 를
빠뜨려도 남의 행이 안 나오는지, 5회에서 잠기는지, 재설정으로 풀리는지,
토큰이 1회용인지 등. **슈퍼유저로 실행하면 스크립트가 스스로 중단합니다** —
그 상태로는 검증이 무의미하기 때문입니다.

### 아직 없는 것

- 세션 무효화 (비밀번호를 바꿔도 기존 세션은 살아 있습니다)
- IP 기준 속도 제한 (지금은 아이디 기준 잠금만)
- 2단계 인증

---

## 다음에 할 일

1. **P0 마무리** — ODsay Server 플랫폼 등록, 실제 응답을 받아
   `fixtures/odsay/gangnam-pangyo.json` 교체. 교체 후 `pnpm test`가 실패하면
   `lib/odsay/types.ts`와 `normalize.ts`만 고치면 됩니다
2. **P3 지도** — 카카오맵 JS SDK + ODsay 노선 그래픽 데이터
   (`info.mapObj`가 그 조회 키입니다. 이미 타입에 넣어 뒀습니다)
3. **P4 이동 조건** — `user_preferences` 테이블은 이미 있고 화면만 없습니다

이후 코드 수정은 WSL의 Claude Code에서 하시는 것이 빠릅니다. 이 압축은
스캐폴드까지입니다.
