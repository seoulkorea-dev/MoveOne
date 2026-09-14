-- ============================================================
-- 보안 정책 검증
--
-- 정책은 "넣었다"가 아니라 "실제로 막는다"를 확인해야 의미가 있습니다.
-- 이 스크립트는 RLS·계정 잠금·재설정이 실제로 동작하는지 증명합니다.
--
-- 반드시 애플리케이션 역할(moveone_app)로 실행해야 합니다.
-- 슈퍼유저(app)로 돌리면 RLS가 우회되어 전부 통과한 것처럼 보입니다.
--
--   docker compose exec -T db psql -U moveone_app -d moveone \
--     -v ON_ERROR_STOP=1 -f - < db/test-security.sql
-- ============================================================

\set ON_ERROR_STOP on
\timing off

\echo ''
\echo '=== 0. 실행 역할 확인 ==='
select case
  when (select usesuper from pg_user where usename = current_user)
    then '치명적: 슈퍼유저로 실행 중입니다. RLS가 우회되어 검증이 무의미합니다. moveone_app 으로 실행하세요.'
  else '  [O] 일반 역할(' || current_user || ')로 실행 중 — RLS가 적용됩니다'
end as role_check \gset check_
\echo :check_role_check

do $$
begin
  if (select usesuper from pg_user where usename = current_user) then
    raise exception '슈퍼유저로는 검증할 수 없습니다.';
  end if;
end $$;

create or replace function pg_temp.assert(cond boolean, label text)
returns void language plpgsql as $$
begin
  if cond then raise notice '  [O] %', label;
  else raise exception '  [X] %', label;
  end if;
end $$;

-- ------------------------------------------------------------
-- 준비
-- ------------------------------------------------------------
select register_local_user('alice', 'HASH_ALICE', 'alice@example.com') as alice_id \gset
select register_local_user('bob',   'HASH_BOB',   'bob@example.com')   as bob_id   \gset
select auth_id from auth_lookup_local('alice') \gset alice_
select auth_id from auth_lookup_local('bob')   \gset bob_

\echo ''
\echo '=== 1. RLS — 컨텍스트가 없으면 아무것도 안 보인다 ==='
begin;
set local app.user_id = '';
select pg_temp.assert((select count(*) from users) = 0,     'users 0건');
select pg_temp.assert((select count(*) from user_auth) = 0, 'user_auth 0건');
commit;

\echo ''
\echo '=== 2. RLS — 내 행만 보인다 ==='
begin;
set local app.user_id = :'alice_id';
select pg_temp.assert((select count(*) from users) = 1,           'users 1건');
select pg_temp.assert((select nickname from users) = 'alice',     '그 1건은 alice');
commit;

\echo ''
\echo '=== 3. RLS — where 절을 빠뜨려도 남의 데이터가 안 나온다 ==='
\echo '    (개발자 실수를 DB가 막아주는지 — 이것이 RLS의 존재 이유입니다)'
begin;
set local app.user_id = :'bob_id';
select pg_temp.assert((select count(*) from users) = 1,      'where 없이 조회해도 1건');
select pg_temp.assert((select nickname from users) = 'bob',  '그 1건은 bob 자신');
select pg_temp.assert((select count(*) from users where id = :alice_id) = 0,
                      'alice 를 id 로 직접 지목해도 0건');
commit;

\echo ''
\echo '=== 4. RLS — 남의 행은 변조되지 않는다 ==='
begin;
set local app.user_id = :'bob_id';
update users set nickname = 'hacked' where id = :alice_id;
commit;
begin;
set local app.user_id = :'alice_id';
select pg_temp.assert((select nickname from users) = 'alice', 'alice 닉네임 그대로');
commit;

\echo ''
\echo '=== 5. searches — 익명 저장은 되고, 남에게는 안 보인다 ==='
begin;
set local app.user_id = '';
insert into searches (user_id, departure_location, arrival_location, result_count)
values (null, '{"lat":37.5,"lng":127.0}', '{"lat":37.4,"lng":127.1}', 3);
commit;

begin;
set local app.user_id = :'alice_id';
insert into searches (user_id, departure_location, arrival_location, result_count)
values (:alice_id, '{"lat":37.5,"lng":127.0}', '{"lat":37.4,"lng":127.1}', 2);
select pg_temp.assert((select count(*) from searches) = 1, 'alice 는 자기 검색만 본다');
commit;

begin;
set local app.user_id = :'bob_id';
select pg_temp.assert((select count(*) from searches) = 0, 'bob 에게는 안 보인다');
commit;

\echo ''
\echo '=== 6. 재설정 토큰은 누구에게도 보이지 않는다 ==='
begin;
set local app.user_id = :'alice_id';
select pg_temp.assert((select count(*) from password_reset_tokens) = 0,
                      '본인 컨텍스트에서도 0건 (함수로만 접근)');
commit;

\echo ''
\echo '=== 7. 계정 잠금 — 4회는 통과, 5회에서 잠긴다 ==='
select pg_temp.assert(record_login_failure(:alice_auth_id) = false, '1회 실패 — 잠기지 않음');
select pg_temp.assert(record_login_failure(:alice_auth_id) = false, '2회');
select pg_temp.assert(record_login_failure(:alice_auth_id) = false, '3회');
select pg_temp.assert(record_login_failure(:alice_auth_id) = false, '4회');
select pg_temp.assert(record_login_failure(:alice_auth_id) = true,  '5회 — 잠김');
select pg_temp.assert((select locked_at from auth_lookup_local('alice')) is not null,
                      'locked_at 이 기록됨');

\echo ''
\echo '=== 8. 잠금은 시간이 지나도 풀리지 않는다 ==='
select pg_temp.assert(record_login_failure(:alice_auth_id) = true, '이후 시도도 계속 잠김');
select pg_temp.assert((select failed_attempts from auth_lookup_local('alice')) = 6,
                      '실패 횟수는 계속 누적됨');

\echo ''
\echo '=== 9. 다른 계정에는 영향이 없다 ==='
select pg_temp.assert((select locked_at from auth_lookup_local('bob')) is null, 'bob 은 정상');
select pg_temp.assert((select failed_attempts from auth_lookup_local('bob')) = 0, 'bob 실패 0회');

\echo ''
\echo '=== 10. 재설정 — 잘못된 토큰은 거부된다 ==='
select pg_temp.assert(confirm_password_reset('WRONG_TOKEN_HASH', 'NEW') = false, '없는 토큰 거부');

\echo ''
\echo '=== 11. 재설정 — 없는 이메일도 예외 없이 null 을 돌려준다 ==='
\echo '    (있는지 없는지가 응답으로 새면 계정 열거가 가능해집니다)'
select pg_temp.assert(request_password_reset('nobody@example.com', 'H1') is null,
                      '없는 이메일 → null');

\echo ''
\echo '=== 12. 재설정 — 성공하면 비밀번호가 바뀌고 잠금이 풀린다 ==='
select pg_temp.assert(request_password_reset('alice@example.com', 'TOKEN_HASH_1') = :alice_id,
                      '토큰 발급됨');
select pg_temp.assert(confirm_password_reset('TOKEN_HASH_1', 'HASH_ALICE_NEW') = true,
                      '재설정 성공');
select pg_temp.assert((select locked_at from auth_lookup_local('alice')) is null,
                      '잠금 해제됨');
select pg_temp.assert((select failed_attempts from auth_lookup_local('alice')) = 0,
                      '실패 카운터 초기화');
select pg_temp.assert((select password_hash from auth_lookup_local('alice')) = 'HASH_ALICE_NEW',
                      '비밀번호가 바뀜');

\echo ''
\echo '=== 13. 재설정 토큰은 1회용이다 ==='
select pg_temp.assert(confirm_password_reset('TOKEN_HASH_1', 'HASH_AGAIN') = false,
                      '같은 토큰 재사용 거부');
select pg_temp.assert((select password_hash from auth_lookup_local('alice')) = 'HASH_ALICE_NEW',
                      '비밀번호가 다시 바뀌지 않음');

\echo ''
\echo '=== 14. 새 요청은 이전 토큰을 무효화한다 ==='
select request_password_reset('alice@example.com', 'TOKEN_OLD');
select request_password_reset('alice@example.com', 'TOKEN_NEW');
select pg_temp.assert(confirm_password_reset('TOKEN_OLD', 'X') = false, '이전 토큰 무효');
select pg_temp.assert(confirm_password_reset('TOKEN_NEW', 'HASH_FINAL') = true, '새 토큰은 유효');

\echo ''
\echo '=== 15. 만료된 토큰은 거부된다 ==='
select request_password_reset('bob@example.com', 'TOKEN_EXPIRED', -1);  -- 이미 만료
select pg_temp.assert(confirm_password_reset('TOKEN_EXPIRED', 'X') = false, '만료 토큰 거부');

\echo ''
\echo '=== 16. 이메일은 대소문자를 구분하지 않는다 ==='
select pg_temp.assert(request_password_reset('ALICE@EXAMPLE.COM', 'TOKEN_CASE') = :alice_id,
                      '대문자 이메일로도 찾는다');

\echo ''
\echo '=============================================='
\echo ' 모든 보안 정책 검증 통과'
\echo '=============================================='
