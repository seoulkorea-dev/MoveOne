---
description: docs/TICKETS.md 의 티켓 하나를 골라 worktree·브랜치까지 만들고 작업을 시작한다
argument-hint: "<티켓ID 예: P1-3>"
allowed-tools: Read, Grep, Glob, Bash(./scripts/wt.sh:*), Bash(git status:*), Bash(git branch:*), Bash(git worktree list)
---

티켓 목록: @docs/TICKETS.md

$1 티켓으로 작업을 시작한다.

1. `docs/TICKETS.md`에서 $1 을 찾아 목표·완료 조건·건드릴 파일을 읽는다. 없으면 거기서 멈추고 알려준다.
2. 선행 티켓이 끝나지 않았으면 알려주고 진행 여부를 묻는다.
3. `./scripts/wt.sh new $1 <짧은-영문-슬러그>` 로 worktree와 브랜치를 만든다.
4. 완료 조건을 체크리스트로 정리해 보여주고, 첫 번째 항목부터 착수한다.
5. 관련 파일을 먼저 **읽고** 나서 고친다. 파일 구조를 추측하지 않는다.

티켓 범위를 벗어나는 개선은 하지 않는다. 발견하면 `docs/TICKETS.md` 하단 "발견한 것" 에 한 줄 적어두고 넘어간다.
