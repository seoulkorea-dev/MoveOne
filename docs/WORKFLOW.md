# 하루 작업 흐름

## 시작
```bash
cd ~/projects/MoveOne
docker compose up -d          # Postgres 5433
claude
```
세션이 열리면 SessionStart 훅이 브랜치·변경 파일 수·worktree 수·DB 상태를 알려준다.

## 티켓 하나 처리
```
/ticket P1-2
```
Claude가 티켓을 읽고 → worktree와 브랜치를 만들고 → 완료 조건을 체크리스트로 세운 뒤 착수한다.

작업 중:
- 파일을 고치면 PostToolUse 훅이 prettier·eslint --fix 를 자동 적용한다.
- `.env` 편집이나 하드코딩된 키는 PreToolUse 훅이 막는다 (`.env.local.example` 은 통과).
- 턴을 끝내려 할 때 소스가 바뀌어 있으면 Stop 훅이 `pnpm verify` 를 돌리고, 실패하면 되돌린다.

## 마무리
```
/verify          # 화면을 건드렸으면 /verify e2e
/review          # code-reviewer 서브에이전트 검토
```
심각도 높음을 해결한 뒤 커밋한다. 커밋·푸시는 직접 요청할 때만 일어난다.

```bash
./scripts/wt.sh rm P1-2      # 머지 후 정리
```

## 서브에이전트 언제 쓰나
| 상황 | 에이전트 |
|---|---|
| 커밋 전 검토 | `code-reviewer` (읽기 전용) |
| lib 로직을 새로 만듦 / 버그 수정 | `test-writer` |
| 테이블·정책·인덱스 변경 | `db-migrator` |
| 화면·컴포넌트 구현 | `ui-builder` |

메인 세션에서 전부 하지 말고 위 작업은 넘긴다. 컨텍스트가 분리되어 메인 세션이 오래 간다.

## 병렬 작업
서로 다른 티켓을 동시에 진행할 때만 worktree를 늘린다. 같은 파일을 두 worktree에서 고치지 않는다.
`wt.sh` 가 worktree마다 다른 포트(4101~)를 배정하지만 **DB(5433)는 공유한다.**
`db/*.sql` 을 건드리는 티켓은 병렬로 돌리지 않는다.

## 막혔을 때
| 증상 | 먼저 볼 것 |
|---|---|
| `pnpm test` 가 API 키를 요구함 | 테스트가 잘못됐다. `fixtures/odsay/` 를 읽어야 한다 |
| ODsay 응답이 예상과 다름 | `odsay-api` 스킬의 연동 절차. 실제 응답부터 fixture에 저장 |
| RLS가 이상함 | `moveone-db` 스킬의 "자주 겪는 문제" 표. 대개 `DATABASE_URL` 이 `app` |
| `db/*.sql` 을 고쳤는데 반영 안 됨 | initdb 는 빈 볼륨에서만 돈다. `pnpm db:reset` 또는 psql 로 직접 적용 |
| 검증이 계속 깨짐 | `./scripts/verify.sh` 로 어느 단계인지 먼저 특정 |
