# MoveOne 화면 시안 8종

Stitch가 내보낸 `screen_searchresult/code.html` 의 `tailwind.config` 를 정본 토큰으로 삼아,
시안이 없던 1차 범위 화면 8개를 같은 디자인 언어로 그렸습니다.

```
index.html                 8개를 한 장에 모아 보는 리뷰 보드 (브라우저로 바로 열기)
screen_login/code.html     로그인            /login
screen_register/           회원가입          /register
screen_reset_request/      비밀번호 찾기      /reset
screen_reset_confirm/      비밀번호 재설정    /reset/confirm
screen_home/               메인 대시보드      /
screen_search/             경로 검색 입력     /search
screen_route_detail/       경로 상세         /route/detail
screen_error_data/         오류·오프라인      /error/data
```

## Stitch 원본에서 고친 것 두 가지

**한글 폰트 폴백 추가.** Barlow Condensed 와 Atkinson Hyperlegible Next 는 라틴 전용이라
한글이 없습니다. 원본 시안 이미지의 한글은 전부 브라우저 기본 폰트로 대체 렌더된 것입니다.
`fontFamily` 스택에 `Noto Sans KR` 을 뒤에 붙여, 숫자·영문은 원본 폰트를 쓰고 한글만
Noto Sans KR 로 떨어지게 했습니다.

**`rounded-full` 수정.** 내보낸 config 의 `borderRadius.full` 이 `0.75rem`(12px)이라
`rounded-full` 을 써도 원형이 되지 않았습니다. `9999px` 로 고쳤습니다. 노선 배지 pill 이
여기에 걸립니다.

나머지 색·타이포·간격 값은 원본 그대로입니다.

## 시안 그대로 둔 것 (구현 시 판단 필요)

ODsay 가 주지 않는 데이터입니다. 시안의 완성도를 위해 남겼으니, 구현할 때
더미 데이터임을 표시하거나 2차로 미뤄야 합니다.

| 요소 | 위치 |
|---|---|
| 실시간 지연 알림 · 지연 배지 | home |
| 정류장 도착 정보 (`2분`, `4분 후`) | home |
| 좌석 여유 · 3분 후 도착 | searchresult (원본) |
| 실시간 안내 시작 CTA | route_detail |

특히 원본 SearchResult 의 **"실시간 교통 정보 및 지하철 정시 운행 데이터가 반영된 결과입니다"**
문구는 1차에서 사실이 아니게 됩니다. 지우거나 문구를 바꿔야 합니다.

## 시안에 반영한 규칙

- safe-area: 헤더 `pt-safe`, 하단 탭바·고정 CTA `pb-safe`
- 터치 타깃 44px: 아이콘 버튼 `w-11 h-11`, 탭바 항목 `min-h-[44px]`
- 접근성: 아이콘 버튼 `aria-label`, 입력 `<label>` 연결, 힌트 `aria-describedby`,
  필터 `role="tab"` / `aria-selected`, 상태 배너 `role="status"`
- 4가지 상태: 로딩 스켈레톤을 뺀 정상·빈·에러는 error_data 와 각 화면의 배너로 표현

## 리포에 넣는 방법

`docs/screens/` 아래에 통째로 두고 `docs/screens.md` 에서 링크하면,
`ui-builder` 서브에이전트가 화면을 만들 때 이 마크업을 참조합니다.
실제 구현은 Next.js + Tailwind v4 이므로, 여기의 `tailwind.config` 값을
`app/globals.css` 의 `@theme` 토큰으로 옮기는 것이 P2-1 입니다.
