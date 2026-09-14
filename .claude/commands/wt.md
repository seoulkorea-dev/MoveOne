---
description: worktree 목록·생성·정리
argument-hint: "list | new <티켓ID> <슬러그> | rm <티켓ID>"
allowed-tools: Bash(./scripts/wt.sh:*), Bash(git worktree list), Bash(git branch:*)
---

현재 worktree: !`git worktree list`

`./scripts/wt.sh $ARGUMENTS` 를 실행하고 결과를 그대로 보여준다.
`rm` 인 경우, 해당 worktree에 커밋되지 않은 변경이 있으면 지우지 말고 먼저 알려준다.
