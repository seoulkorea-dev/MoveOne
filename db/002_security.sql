-- ============================================================
-- MoveOne — 보안 계층
--   1. 애플리케이션 전용 역할 (RLS가 실제로 동작하려면 필수)
--   2. 이메일 + 비밀번호 재설정
--   3. 로그인 실패 5회 → 계정 잠금 (재설정해야 해제)
--   4. Row Level Security
--
-- schema.sql 다음에 적용합니다. 멱등합니다.
-- ============================================================


-- ============================================================
-- 1. 애플리케이션 전용 역할
--
-- 슈퍼유저는 RLS를 통째로 우회합니다. Docker의 POSTGRES_USER=app 은
-- 슈퍼유저를 만들기 때문에, 그 역할로 접속하는 한 어떤 정책도 효과가
-- 없습니다. 정책을 넣고도 "다 보이는" 상태가 되는 가장 흔한 원인입니다.
--
--   마이그레이션 → app (슈퍼유저)
--   애플리케이션 → moveone_app (일반 역할)
--
-- DATABASE_URL 이 moveone_app 을 가리켜야 RLS가 살아납니다.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'moveone_app') then
    -- 로컬 개발용입니다. 운영에서는 반드시 바꾸세요:
    --   alter role moveone_app password '...';
    create role moveone_app login password 'moveone_dev';
  end if;
end $$;

grant usage on schema public to moveone_app;
grant select, insert, update, delete on all tables in schema public to moveone_app;
grant usage, select on all sequences in schema public to moveone_app;
grant execute on all functions in schema public to moveone_app;

alter default privileges in schema public
  grant select, insert, update, delete on tables to moveone_app;
alter default privileges in schema public
  grant usage, select on sequences to moveone_app;
alter default privileges in schema public
  grant execute on functions to moveone_app;


-- ============================================================
-- 2. 이메일과 계정 잠금 컬럼
-- ============================================================

-- 비밀번호 재설정을 하려면 연락 수단이 있어야 합니다.
alter table users add column if not exists email text;

-- 대소문자를 구분하지 않고 유일해야 합니다. Alice@x.com 과
-- alice@x.com 이 서로 다른 계정이 되면 재설정 흐름이 망가집니다.
create unique index if not exists uq_users_email_lower
  on users (lower(email)) where email is not null;

-- 연속 실패 횟수와 잠금 시각.
-- locked_at 이 null 이 아니면 잠긴 계정입니다.
-- 시간이 지나도 자동으로 풀리지 않습니다 — 재설정해야 풀립니다.
alter table user_auth add column if not exists failed_attempts integer not null default 0;
alter table user_auth add column if not exists locked_at timestamptz;


-- ============================================================
-- 3. 로그인 시도 기록 (감사 추적)
--
-- 잠금 판단은 user_auth.failed_attempts 가 하고, 이 테이블은
-- "언제 어디서 시도했는가"를 남깁니다. 공공·금융 도메인에서
-- 요구되는 접근 기록이고, 공격 패턴 분석에도 씁니다.
--
-- 존재하지 않는 아이디도 기록합니다. 그러지 않으면 응답 차이로
-- "그 아이디는 없다"가 새어나갑니다.
-- ============================================================

create table if not exists login_attempts (
  id           bigint generated always as identity primary key,
  username     text        not null,
  ip           text,
  user_agent   text,
  success      boolean     not null,
  outcome      text        not null default 'unknown'
                           check (outcome in ('success','bad_password','no_such_user','locked','unknown')),
  attempted_at timestamptz not null default now()
);

create index if not exists idx_login_attempts_username
  on login_attempts (username, attempted_at desc);
create index if not exists idx_login_attempts_ip
  on login_attempts (ip, attempted_at desc);


-- ============================================================
-- 4. 비밀번호 재설정 토큰
--
-- 토큰 원문을 저장하지 않습니다. DB가 유출되면 그 토큰으로 누구나
-- 비밀번호를 바꿀 수 있기 때문입니다. 비밀번호와 같은 이유로 해시만
-- 보관하고, 원문은 메일로만 나갑니다.
-- ============================================================

create table if not exists password_reset_tokens (
  id          bigint generated always as identity primary key,
  user_id     bigint      not null references users(id) on delete cascade,
  token_hash  text        not null unique,   -- sha256(원문)
  expires_at  timestamptz not null,
  used_at     timestamptz,                   -- 1회용
  requested_ip text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_reset_tokens_user on password_reset_tokens (user_id, created_at desc);
create index if not exists idx_reset_tokens_expires on password_reset_tokens (expires_at);


-- ============================================================
-- 5. 인증 함수 (SECURITY DEFINER)
--
-- 로그인·가입·재설정은 "사용자가 누구인지 알기 전"에 일어납니다.
-- RLS 컨텍스트를 심을 수 없으므로, 이 통로만 좁게 열어 둡니다.
--   - search_path 를 고정해 함수 가로채기를 막습니다
--   - 비밀번호 검증은 애플리케이션에서 합니다 (여기서 하지 않음)
-- ============================================================

create or replace function app_current_user_id()
returns bigint language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::bigint;
$$;


/** 로그인 조회. 잠금 상태까지 함께 돌려줍니다. */
create or replace function auth_lookup_local(p_username text)
returns table (
  user_id         bigint,
  auth_id         bigint,
  password_hash   text,
  failed_attempts integer,
  locked_at       timestamptz,
  email           text
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select a.user_id, a.id, a.password_hash, a.failed_attempts, a.locked_at, u.email
    from user_auth a
    join users u on u.id = a.user_id
   where a.provider = 'local'
     and a.provider_user_id = p_username
     and u.status = 'active';
$$;


/**
 * 로그인 실패를 기록하고, 임계치에 닿으면 계정을 잠급니다.
 * 잠긴 계정은 시간이 지나도 풀리지 않습니다 — 재설정만이 해제 수단입니다.
 * 반환: 잠금 여부
 */
create or replace function record_login_failure(p_auth_id bigint, p_max_fails integer default 5)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_fails integer;
begin
  update user_auth
     set failed_attempts = failed_attempts + 1,
         locked_at = case
           when failed_attempts + 1 >= p_max_fails and locked_at is null then now()
           else locked_at
         end
   where id = p_auth_id
   returning failed_attempts into v_fails;

  return coalesce(v_fails, 0) >= p_max_fails;
end;
$$;


/** 로그인 성공. 실패 카운터를 초기화합니다. */
create or replace function record_login_success(p_auth_id bigint)
returns void
language sql security definer set search_path = public, pg_temp
as $$
  update user_auth
     set last_login_at = now(),
         login_count = login_count + 1,
         failed_attempts = 0
   where id = p_auth_id;
$$;


/** 가입. users 와 user_auth 를 원자적으로 넣습니다. */
create or replace function register_local_user(
  p_username text,
  p_password_hash text,
  p_email text default null
)
returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id bigint;
begin
  insert into users (nickname, email) values (p_username, p_email) returning id into v_user_id;

  insert into user_auth (user_id, provider, provider_user_id, password_hash,
                         login_count, last_login_at)
  values (v_user_id, 'local', p_username, p_password_hash, 1, now());

  return v_user_id;
end;
$$;


/**
 * 재설정 요청. 이메일로 사용자를 찾아 토큰 해시를 저장합니다.
 * 찾지 못해도 예외를 던지지 않고 null 을 돌려줍니다 —
 * 호출자가 "찾았는지 여부"에 따라 다르게 응답하면 계정 열거가 가능해집니다.
 * 기존 미사용 토큰은 무효화합니다.
 */
create or replace function request_password_reset(
  p_email      text,
  p_token_hash text,
  p_ttl_mins   integer default 30,
  p_ip         text default null
)
returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id bigint;
begin
  select u.id into v_user_id
    from users u
   where lower(u.email) = lower(p_email)
     and u.status = 'active'
   limit 1;

  if v_user_id is null then
    return null;
  end if;

  update password_reset_tokens
     set used_at = now()
   where user_id = v_user_id and used_at is null and expires_at > now();

  insert into password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
  values (v_user_id, p_token_hash, now() + make_interval(mins => p_ttl_mins), p_ip);

  return v_user_id;
end;
$$;


/**
 * 재설정 확정. 토큰이 유효하면 비밀번호를 바꾸고
 * 실패 카운터와 잠금을 함께 해제합니다.
 * 반환: 성공 여부
 */
create or replace function confirm_password_reset(p_token_hash text, p_new_hash text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id bigint;
begin
  select user_id into v_user_id
    from password_reset_tokens
   where token_hash = p_token_hash
     and used_at is null
     and expires_at > now()
   limit 1;

  if v_user_id is null then
    return false;
  end if;

  -- 1회용: 먼저 소진 처리
  update password_reset_tokens set used_at = now() where token_hash = p_token_hash;

  update user_auth
     set password_hash   = p_new_hash,
         failed_attempts = 0,
         locked_at       = null      -- 잠금 해제는 여기서만 일어납니다
   where user_id = v_user_id and provider = 'local';

  return true;
end;
$$;


-- ============================================================
-- 6. Row Level Security
--
-- 소유자도 RLS를 우회하므로 FORCE 가 필요합니다.
-- (슈퍼유저 문제는 위의 전용 역할로 해결했습니다.)
-- ============================================================

alter table users enable row level security;
alter table users force  row level security;
drop policy if exists users_self on users;
create policy users_self on users
  using (id = app_current_user_id())
  with check (id = app_current_user_id());

alter table user_auth enable row level security;
alter table user_auth force  row level security;
drop policy if exists user_auth_self on user_auth;
create policy user_auth_self on user_auth
  using (user_id = app_current_user_id())
  with check (user_id = app_current_user_id());

alter table user_preferences enable row level security;
alter table user_preferences force  row level security;
drop policy if exists user_preferences_self on user_preferences;
create policy user_preferences_self on user_preferences
  using (user_id = app_current_user_id())
  with check (user_id = app_current_user_id());

-- 재설정 토큰은 어떤 사용자도 직접 읽을 이유가 없습니다.
-- SECURITY DEFINER 함수로만 접근합니다.
alter table password_reset_tokens enable row level security;
alter table password_reset_tokens force  row level security;
drop policy if exists reset_tokens_none on password_reset_tokens;
create policy reset_tokens_none on password_reset_tokens using (false);

-- searches: 비로그인 검색도 저장돼야 하므로 읽기와 쓰기를 나눕니다.
alter table searches enable row level security;
alter table searches force  row level security;

drop policy if exists searches_select on searches;
create policy searches_select on searches for select
  using (user_id = app_current_user_id());

drop policy if exists searches_insert on searches;
create policy searches_insert on searches for insert
  with check (user_id is null or user_id = app_current_user_id());

drop policy if exists searches_update on searches;
create policy searches_update on searches for update
  using (user_id is null or user_id = app_current_user_id())
  with check (user_id is null or user_id = app_current_user_id());

-- 참고: search_routes / search_route_segments 에는 걸지 않았습니다.
-- 이 행들은 search_id 로만 도달할 수 있고, search_id 는 searches 를 거쳐야
-- 얻어집니다. 부모를 막으면 경로가 닫힙니다. 자식까지 정책을 걸면 삽입마다
-- 부모 조회가 붙어 검색 저장이 느려지는데, 얻는 것이 거의 없습니다.
-- 교통 캐시(transit_*, route_cache)와 api_logs 는 사용자 소유 데이터가 아닙니다.
