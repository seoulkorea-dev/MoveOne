---
description: 현재 브랜치 변경을 code-reviewer 서브에이전트로 검토한다
argument-hint: "[비교대상 브랜치, 기본 main]"
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git status:*), Task
---

변경 요약: !`git diff --stat ${1:-main}...HEAD`

`code-reviewer` 서브에이전트를 호출해 `${1:-main}...HEAD` 범위를 검토하게 한다.
결과를 그대로 전달하고, 심각도 높음 항목이 있으면 어떤 순서로 고칠지만 제안한다. 임의로 고치지 않는다.
