# 코드 규약

스택·명령·구조는 `CLAUDE.md` 참고. 여기는 코드를 쓸 때의 규약만 둡니다.

## 배치 규칙
| 넣을 것 | 위치 |
|---|---|
| 라우트·화면 | `app/` — `page.tsx` / `layout.tsx` / `route.ts` 만 |
| 재사용 UI | `components/` (상태 없는 것 우선) |
| 도메인 로직 | `lib/` ← 테스트의 주 대상 |
| ODsay 경계 | `lib/odsay/` 안에서 끝낸다 |
| 도메인 타입·정렬·포매터 | `lib/routes.ts` |
| SQL 스키마 | `db/NNN_*.sql` (기존 파일 수정 금지, 새 파일 추가) |
| 응답 샘플 | `fixtures/odsay/` |
| 단위 테스트 | `lib/__tests__/` 또는 `<파일>.test.ts` |
| E2E | `tests/e2e/` |

## 규약
- Server Component 기본. `'use client'`는 상호작용이 필요한 최소 단위에만.
- 외부 API 호출은 **반드시 서버에서**. `lib/odsay/client.ts` 는 `import "server-only"` 로 시작한다.
- DB 접근은 `lib/db.ts` 의 `query()` 로만. 라우트 핸들러에서 pg를 직접 쓰지 않는다.
- 타입 `any` 금지. 외부 응답은 `lib/odsay/types.ts` 에 명시하고 `normalize.ts` 에서 도메인 타입으로 좁힌다.
- 외부 응답은 방어적으로. 필드가 없어도 예외를 던지지 않는다.
- 에러는 삼키지 않는다. `lib/` 에서는 던지고, route handler에서 상태코드로 변환한다.
- 시각은 `timestamptz`(UTC) 저장, 표시할 때만 `lib/kst.ts` 로 변환.
- 파일 300줄, 함수 50줄을 넘으면 쪼갠다.
- 주석은 "왜"만 적는다. "무엇"은 코드가 말하게 한다.

## 하지 말 것
- **새 의존성을 묻지 않고 추가하는 것.** 특히 상태관리·ORM·UI 킷.
- `tailwind.config.js` 만들기 (v4는 `@theme` 를 쓴다)
- 코드 생성기로 기존 파일 덮어쓰기
- 이미 적용된 `db/*.sql` 수정하기
