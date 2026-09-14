---
description: 전체 검증(타입·린트·단위테스트·빌드)을 돌리고 실패만 고친다
allowed-tools: Bash(pnpm verify), Bash(pnpm typecheck), Bash(pnpm lint:*), Bash(pnpm test:*), Bash(pnpm build), Read, Edit, Grep, Glob
argument-hint: "[e2e]"
---

현재 변경 상태: !`git status --short`

`pnpm verify`를 실행한다. $ARGUMENTS 에 `e2e`가 있으면 `pnpm test:e2e`도 이어서 실행한다.

실패하면:
1. 첫 번째 실패만 골라 원인을 짚는다. 여러 실패를 한꺼번에 고치려 하지 않는다.
2. 최소 변경으로 고친다. 테스트를 통과시키려고 테스트를 약화시키지 않는다.
3. 다시 `pnpm verify`를 돌려 확인한다.

전부 통과하면 "검증 통과" 한 줄과 무엇을 고쳤는지만 보고한다.
