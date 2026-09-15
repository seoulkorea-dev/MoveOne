-- ============================================================
-- MoveOne 003 — 약관·개인정보 동의 기록
--
--   docker compose exec -T db psql -U app -d moveone < db/003_consent.sql
--
-- 왜 별도 테이블인가:
--   users 에 boolean 두 개를 붙이면 "지금 동의 상태"만 남고 **언제 동의했는지**,
--   **어느 버전에 동의했는지**가 사라집니다. 개인정보 동의는 분쟁이 생겼을 때
--   그 두 가지를 증명해야 하는 기록이라, 덮어쓰지 않고 행으로 쌓습니다.
--
--   철회도 삭제가 아니라 agreed=false 인 새 행입니다. 그래야 "2026-09-15 에
--   동의했다가 2026-11-02 에 철회했다" 는 이력이 남습니다.
-- ============================================================

create table if not exists user_consents (
  id          bigint generated always as identity primary key,
  user_id     bigint      not null references users(id) on delete cascade,

  -- terms    이용약관 (필수)
  -- privacy  개인정보 수집·이용 (필수)
  -- age14    만 14세 이상 확인 (필수)
  -- marketing 마케팅 정보 수신 (선택)
  doc_type    text        not null
                          check (doc_type in ('terms', 'privacy', 'age14', 'marketing')),

  -- 문서 버전. 날짜 문자열입니다 (lib/consent.ts 의 상수와 같은 값).
  -- 문서를 고치면 버전을 올리고 재동의를 받습니다.
  doc_version text        not null,

  agreed      boolean     not null,
  agreed_at   timestamptz not null default now()
);

-- "이 사용자의 이 항목, 가장 최근 상태" 를 뽑는 질의가 주 용도입니다.
create index if not exists idx_user_consents_lookup
  on user_consents (user_id, doc_type, agreed_at desc);

comment on table  user_consents            is '약관·개인정보 동의 이력. 덮어쓰지 않고 쌓습니다.';
comment on column user_consents.doc_version is '동의한 문서의 버전. 문서가 바뀌면 재동의가 필요합니다.';
comment on column user_consents.agreed_at   is '동의(또는 철회) 시각. UTC 로 저장하고 표시할 때 KST 로 바꿉니다.';


-- ============================================================
-- 가입 시점 기록용 함수
--
-- 회원가입은 세션이 생기기 **전**에 일어나므로 app.user_id 가 비어 있고,
-- 따라서 RLS 정책(user_id = app_current_user_id())을 통과할 수 없습니다.
-- register_local_user 와 같은 방식으로 SECURITY DEFINER 함수를 씁니다.
--
-- 남의 user_id 로 동의를 심는 것을 막기 위해 두 가지만 허용합니다.
--   1. 로그인한 본인이 부르는 경우
--   2. 익명 컨텍스트에서, 방금 만들어진 계정(10분 이내)에 대해 부르는 경우
--      — 즉 가입 처리 중일 때만
-- ============================================================
create or replace function record_user_consents(p_user_id bigint, p_items jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_caller bigint := app_current_user_id();
  v_fresh  boolean;
  v_count  integer := 0;
begin
  if v_caller is not null and v_caller <> p_user_id then
    raise exception '본인의 동의만 기록할 수 있습니다.' using errcode = '42501';
  end if;

  if v_caller is null then
    select created_at > now() - interval '10 minutes'
      into v_fresh
      from users where id = p_user_id;

    if not coalesce(v_fresh, false) then
      raise exception '가입 직후에만 익명으로 동의를 기록할 수 있습니다.' using errcode = '42501';
    end if;
  end if;

  insert into user_consents (user_id, doc_type, doc_version, agreed)
  select p_user_id,
         item ->> 'type',
         item ->> 'version',
         coalesce((item ->> 'agreed')::boolean, false)
    from jsonb_array_elements(p_items) as item
   where item ->> 'type' is not null
     and item ->> 'version' is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function record_user_consents is
  '가입 시점 동의 기록. 세션이 아직 없으므로 SECURITY DEFINER 로 돕니다.';


-- ============================================================
-- Row Level Security
--
-- 본인 것만 보이고, 본인 것만 넣을 수 있습니다.
-- UPDATE·DELETE 정책은 **일부러 만들지 않습니다.** 동의 기록은 고치거나
-- 지우는 것이 아니라 쌓는 것입니다. 정책이 없으면 전면 차단입니다.
-- ============================================================
alter table user_consents enable row level security;
alter table user_consents force  row level security;

drop policy if exists user_consents_select on user_consents;
create policy user_consents_select on user_consents for select
  using (user_id = app_current_user_id());

drop policy if exists user_consents_insert on user_consents;
create policy user_consents_insert on user_consents for insert
  with check (user_id = app_current_user_id());

grant select, insert on user_consents to moveone_app;
grant usage, select on all sequences in schema public to moveone_app;
grant execute on function record_user_consents(bigint, jsonb) to moveone_app;
