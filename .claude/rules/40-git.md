# Git · Worktree · 브랜치

## 브랜치
- `main`은 항상 `pnpm verify`가 통과하는 상태.
- 티켓 하나당 브랜치 하나: `feat/P1-route-search`, `fix/P0-session-cookie`, `chore/...`, `docs/...`
- 브랜치 이름에 티켓 ID(P0-3 등)를 넣는다.

## Worktree
병렬 작업은 worktree로 분리한다. 같은 리포에서 두 티켓을 동시에 건드리지 않는다.

```bash
claude --worktree feat/P1-route-search   # Claude Code 내장
./scripts/wt.sh new P1-3 route-search    # 포트·DB까지 분리해서 만들기
./scripts/wt.sh list
./scripts/wt.sh rm P1-3
```

worktree마다 `.env.local`이 필요하므로 `.worktreeinclude`에 등록해 두었다.
포트 충돌을 피하려고 `wt.sh`가 worktree별로 `PORT`를 4101부터 배정한다.

## 커밋
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- 제목은 한국어 한 줄 50자 이내. 본문에 "왜"를 적는다.
- **한 커밋 = 한 논리적 변경.** 포맷팅과 로직 변경을 섞지 않는다.
- `pnpm verify` 실패 상태로 커밋하지 않는다.
- `git push --force`는 공유 브랜치에 금지. 본인 feature 브랜치는 `--force-with-lease`만.

## 하지 말 것
- 요청 없이 커밋·푸시하지 않는다. 사용자가 명시적으로 요청할 때만.
- `main`에 직접 커밋하지 않는다.
- 생성 산출물(`.next/`, `node_modules/`, `coverage/`, `playwright-report/`)을 커밋하지 않는다.
