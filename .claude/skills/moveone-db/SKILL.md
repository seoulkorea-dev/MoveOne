---
name: moveone-db
description: MoveOne의 Postgres 스키마·마이그레이션·RLS 작업에 쓴다. 테이블 추가/변경, 정책 작성, 로컬 DB 문제 해결에 사용한다.
when_to_use: DB 스키마를 바꾸거나 RLS·권한 문제를 다룰 때
---

# MoveOne DB

로컬: Docker Postgres 17, 호스트 포트 **5433** (5432 아님). `db/schema.sql` 11개 테이블 + `db/002_security.sql` 보안 계층.

## 역할 구분 (가장 자주 실수하는 지점)
- `app` — Docker의 `POSTGRES_USER`. **슈퍼유저다. 슈퍼유저는 RLS를 통째로 우회한다.**
- `moveone_app` — 애플리케이션 런타임 전용 역할. `DATABASE_URL`은 **반드시** 이 역할을 쓴다.
- 마이그레이션만 `app`으로 실행한다.

RLS가 안 먹는 것처럼 보이면 십중팔구 `DATABASE_URL`이 `app`으로 되어 있는 것이다. 먼저 이걸 확인한다.

## 마이그레이션 규칙
- 위치 `db/NNN_snake_case.sql`. `001_schema.sql`(=schema.sql)과 `002_security.sql` 은 이미 적용되어 있다. 기존 파일은 **절대 수정하지 않는다.** 항상 새 파일.
- compose.yaml 이 `db/*.sql` 을 `docker-entrypoint-initdb.d` 로 마운트한다. **이미 만들어진 볼륨에는 다시 적용되지 않는다.** 새 파일은 `docker compose exec -T db psql -U app -d moveone < db/00N_*.sql` 로 직접 적용하거나, 개발 중이면 `docker compose down -v` 로 초기화한다.
- 되돌리는 SQL을 파일 상단 주석에 남긴다.
- 새 테이블을 만들면 같은 파일에서:
  ```sql
  ALTER TABLE t ENABLE ROW LEVEL SECURITY;
  CREATE POLICY t_owner ON t USING (user_id = current_setting('app.user_id', true)::uuid);
  GRANT SELECT, INSERT, UPDATE, DELETE ON t TO moveone_app;
  ```
  정책 없이 RLS만 켜면 전면 차단된다. 반드시 함께 쓴다.
- 세션 변수 `app.user_id`는 요청 시작 시 `lib/db.ts`에서 설정한다. 커넥션 풀을 쓰므로 **트랜잭션마다** 설정해야 한다.

## 확인 명령
```bash
docker compose up -d
psql "postgres://app:...@localhost:5433/moveone" -c "\dt"
# RLS 상태 확인
psql ... -c "select relname, relrowsecurity from pg_class where relkind='r' and relnamespace='public'::regnamespace;"
# 정책 목록
psql ... -c "select tablename, policyname, qual from pg_policies;"
# 실제로 막히는지 런타임 역할로 확인
psql "postgres://moveone_app:...@localhost:5433/moveone" -c "select count(*) from users;"
```

## 자주 겪는 문제
| 증상 | 원인 |
|---|---|
| RLS를 켰는데 전부 보임 | `DATABASE_URL`이 `app`(슈퍼유저) |
| RLS를 켰는데 전부 안 보임 | 정책을 안 만들었거나 `app.user_id`가 미설정 |
| 포트 연결 거부 | 5432로 붙고 있음. 5433이다 |
| 마이그레이션 권한 오류 | `moveone_app`으로 실행 중. 마이그레이션은 `app` |
