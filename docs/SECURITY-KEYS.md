# 키 관리

## 먼저 — 다섯 개가 같은 종류가 아닙니다

| 값 | 성격 | 방어선 |
| --- | --- | --- |
| `ODSAY_API_KEY` | 진짜 비밀 · 서버 전용 | 파일 밖으로 내지 않기 + 서버 IP 등록 |
| `KAKAO_REST_API_KEY` | 진짜 비밀 · 서버 전용 | 파일 밖으로 내지 않기 |
| `SESSION_SECRET` | 진짜 비밀 | 파일 밖으로 내지 않기 |
| `DATABASE_URL` | 로컬 개발 비밀번호 | 운영은 완전히 별개 값 |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | **비밀이 아님** | 카카오 콘솔의 사이트 도메인 등록 |

마지막 줄이 중요합니다. `NEXT_PUBLIC_` 은 `next build` 때 **브라우저 번들에
문자열로 박힙니다.** 금고에 넣어도 사용자가 개발자도구에서 그대로 봅니다.
이 값은 "숨기는 것"이 아니라 "등록된 도메인에서만 동작하게 묶는 것"으로
보호합니다. 여기에 시간을 쓰지 마세요.

## 위험의 실제 순서

혼자 쓰는 PC에서 키가 새는 경로는 디스크 탈취가 아닙니다.

1. **실수로 커밋** → 공개 저장소 (압도적 1위)
2. **붙여넣기 유출** — curl 명령, 스크린샷, 로그, 채팅
3. **셸 히스토리** — `~/.bash_history` 에 curl 한 줄이 그대로 남습니다

파일 암호화(`pass`, 1Password)는 그다음입니다. 디스크를 가져간 사람은 대개
복호화 수단도 같이 가져갑니다.

## 걸어둔 장치

```bash
./scripts/secure-init.sh     # 한 번만. .gitignore · 훅 · 권한을 한꺼번에
./scripts/audit-secrets.sh   # 아무 때나. 이미 샜는지 점검만 (고치지 않음)
```

`.githooks/pre-commit` 이 커밋 직전에 막는 것:

- `.env` 계열 파일 (`*.example` 은 통과)
- 패치 백업 `*.bak-*`, 개인키 `*.pem` `*.key`
- `KakaoAK <키>` 가 코드에 박힌 경우
- 비밀값스러운 이름에 16자 이상 리터럴이 붙은 줄
- 접속 문자열 안의 비밀번호, `BEGIN ... PRIVATE KEY` 블록

일부러 넣은 값이면 그 줄 끝에 `# secret-ok` 를 붙입니다.
`--no-verify` 로 건너뛸 수 있지만, 그러면 이 장치를 둔 의미가 없습니다.

## 셸 히스토리

앞으로 키가 든 명령은 **맨 앞에 공백 한 칸**을 넣고 치세요.

```bash
  curl "https://api.odsay.com/v1/api/...?apiKey=..."
# ↑ 공백
```

bash 의 `HISTCONTROL` 기본값이 `ignorespace` 를 포함하므로 히스토리에
남지 않습니다. 확실히 하려면 `~/.bashrc` 에 추가하세요.

```bash
export HISTCONTROL=ignorespace:ignoredups
```

---

# 키 교체 (rotation)

지금까지 curl·터미널·문서에 키를 여러 번 노출했다면 **한 번 교체하고 가는 것이
맞습니다.** 노출 여부가 확실하지 않을 때도 교체가 확인보다 쌉니다.

## SESSION_SECRET — 가장 쉽고, 지금 하세요

```bash
openssl rand -base64 48
```

`.env.local` 의 값을 바꾸고 개발 서버를 재시작합니다.
**기존 로그인 세션이 전부 끊깁니다.** 개발 중에는 문제없습니다.

## ODsay — 콘솔에서 재발급

1. <https://lab.odsay.com> → 로그인 → 내 API 키
2. 기존 키 폐기 후 새 키 발급
3. 새 키에 **Server 플랫폼 + 공인 IP** 를 다시 등록 (`curl ifconfig.me`)
4. `.env.local` 의 `ODSAY_API_KEY` 교체 → 개발 서버 재시작

IP 등록은 반영에 시간이 걸립니다. 지난번 `ApiKeyAuthFailed` 의 실제 원인이
이 전파 지연이었습니다. 바로 안 되면 몇 분 기다렸다 다시 해보세요.

## 카카오 — 앱을 지우지 말고 **복제 키**

카카오는 앱을 삭제하지 않고 키만 갈아끼우는 길을 제공합니다.

1. 카카오 콘솔 → 내 애플리케이션 → MoveOne → 앱 설정 → 앱 키
2. **복제 키 생성** — 기존 설정을 그대로 물려받은 새 키가 추가됩니다
3. `.env.local` 의 `KAKAO_REST_API_KEY` / `NEXT_PUBLIC_KAKAO_JS_KEY` 를 새 값으로
4. 동작을 확인한 뒤 **원본 키 삭제**

> **앱을 새로 만들지 마세요.** 2026-07-21 정책 변경으로 계정당 첫 앱만
> 무료 쿼터입니다. 앱을 지우고 다시 만들면 그 쿼터를 잃습니다.
> 복제 키는 같은 앱 안의 일이라 쿼터에 영향이 없습니다.

JS 키를 바꾸면 **사이트 도메인 등록이 새 키에도 붙어 있는지** 확인하세요.
빠져 있으면 지도가 `domain mismatched` 로 다시 막힙니다.

## DATABASE_URL

로컬 개발 비밀번호라 급하지 않습니다. 바꾸려면 `db/002_security.sql` 의
`moveone_app` 비밀번호와 `.env.local` 을 함께 고칩니다.
**운영 DB 비밀번호는 로컬과 같은 값을 쓰지 않습니다.**

## 교체 후

```bash
./scripts/audit-secrets.sh
pnpm dev
```

지하철 검색 한 번, 경로 상세 한 번 — ODsay 와 카카오 양쪽이 살아 있는지
이 두 번으로 확인됩니다.

---

# 배포 (Vercel)

## 값을 넣는 곳

Vercel 대시보드 → Project → Settings → Environment Variables.
`.env.local` 은 배포에 올라가지 않습니다 (`.gitignore` 에 있으므로).

환경을 셋으로 나눠 **서로 다른 값**을 넣습니다.

| 환경 | 쓰는 곳 | 키 |
| --- | --- | --- |
| Development | 로컬 `vercel dev` | 개발용 |
| Preview | PR 브랜치 배포 | 개발용과 분리 권장 |
| Production | `main` 배포 | 운영 전용 |

`SESSION_SECRET` 은 **환경마다 다른 값**이어야 합니다. 같은 값을 쓰면
프리뷰 배포에서 만든 세션이 운영에서도 유효합니다.

## NEXT_PUBLIC_ 은 빌드 시점에 박힙니다

`NEXT_PUBLIC_KAKAO_JS_KEY` 와 `NEXT_PUBLIC_LOG_LEVEL` 은 런타임 값이
아니라 **빌드 산출물에 문자열로 들어갑니다.** 그래서

- Vercel 에서 이 값을 바꾸면 **재배포해야** 반영됩니다
- 프리뷰와 운영이 다른 값을 쓰려면 환경별로 각각 등록해야 합니다
- `NEXT_PUBLIC_LOG_LEVEL` 은 운영에서 **반드시 `error`** 로 두세요.
  `debug` 로 두면 사용자 브라우저 콘솔에 앱 내부 흐름이 전부 찍힙니다

## 배포 전 체크리스트

- [ ] `NEXT_PUBLIC_LOG_LEVEL=error`
- [ ] `SESSION_SECRET` 이 로컬과 다른 새 값
- [ ] `DATABASE_URL` 이 `moveone_app` 역할 (`app` 은 슈퍼유저라 RLS 우회)
- [ ] ODsay 콘솔에 **Vercel 의 나가는 IP** 등록.
      서버리스는 IP 가 고정되지 않으므로, 고정이 필요하면 Vercel 의 고정 IP
      기능이나 프록시가 필요합니다. 여기서 막히면 ODsay 호출이 전부 실패합니다
- [ ] 카카오 콘솔 사이트 도메인에 **배포 도메인** 추가 (`localhost:4100` 과 별개)
- [ ] `pnpm verify` 통과

ODsay 의 IP 제한은 배포에서 가장 먼저 부딪히는 벽입니다. 배포 대상을 정하는
시점에 이것부터 확인하세요.

## 더 갈 수 있는 길

로컬 파일에서도 평문을 없애고 싶으면 두 가지가 있습니다. 지금 단계에서는
필수가 아닙니다.

- **`pass`** (GPG 기반, 무료) — `scripts/dev.sh` 로 실행 시점에만 환경변수 주입
- **1Password CLI** — `.env.local` 에 값 대신 `op://` 참조만 적고 `op run` 으로 실행

Next.js 의 환경변수 조회 순서는 `process.env` → `.env.local` → `.env` 이므로,
셸에서 주입한 값이 `.env.local` 을 **이깁니다.** 두 방식 모두 파일을 그대로 둔
채 덮어쓰는 형태로 붙일 수 있습니다.
