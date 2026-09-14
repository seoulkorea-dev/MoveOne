---
paths:
  - "lib/odsay/**"
  - "lib/kakao/**"
  - "app/api/**"
---
# 외부 API 연동 규칙

## 공통
- 모든 외부 호출은 서버 사이드 프록시(`app/api/**/route.ts`)를 거친다.
- 모든 응답은 `lib/odsay/normalize.ts` / `lib/kakao/`에서 내부 타입으로 변환한 뒤 상위로 넘긴다. 외부 응답 형태를 UI까지 흘리지 않는다.
- 타임아웃 5초, 재시도 1회(지수 백오프), 실패 시 사용자에게 보이는 메시지는 일반화한다.
- 응답 캐시는 필수. 키는 `provider:endpoint:정규화된파라미터`.

## ODsay Lab
- 문서: https://lab.odsay.com/guide/releaseReference
- API 키 타입은 **Server(IP)**. Android 타입 키는 웹앱에서 동작하지 않는다. URI/IP 각 5개까지 등록 가능.
- 호출 한도가 문서에 없으므로 캐시 히트를 최우선으로 한다. 경로 검색 결과 TTL 10분, 정류장·노선 메타 TTL 24시간.
- ODsay는 조합 경로를 주지 않는다 → `lib/routing/`이 후보를 조합한다.
- 개발 중 응답 확인은 ODsay가 제공하는 대중교통 MCP를 활용한다.
- 새 엔드포인트를 처음 붙일 때는 실제 응답을 `fixtures/odsay/<endpoint>.json`으로 저장하고, 필드 의미를 `docs/api-notes.md`에 기록한다.

## 카카오
- 지도: **JavaScript SDK**(클라이언트, `NEXT_PUBLIC_KAKAO_JS_KEY`). 등록 도메인에서만 동작한다.
- 주소→좌표: **Local REST API**(서버 전용, `KAKAO_REST_API_KEY`). 클라이언트에서 직접 호출 금지.
- 앱은 계정당 하나만 만들어 공유한다(무료 쿼터 정책).

## 공공데이터포털 (2차)
- 실시간 도착정보용. 1차 범위 아님.
- ODsay와 정류장 ID 체계가 다르다 → `stop_id_map` 테이블로 매핑한다. 매핑 없는 정류장은 실시간 정보를 숨긴다.
