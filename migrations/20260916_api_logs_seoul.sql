-- api_logs.provider 에 'seoul' 을 허용합니다.
--
-- 지하철 경로를 서울시 공공 API 로 조회하면서 provider 값이 하나 늘었습니다.
-- 이 컬럼에 체크 제약이 걸려 있으면 로그 INSERT 가 실패합니다.
--
-- logApiCall() 은 try/catch 로 감싸져 있어 실패해도 검색은 정상 동작하지만,
-- 그러면 호출 기록이 조용히 사라집니다. KPI 의 원천이므로 막아둡니다.
--
-- 제약이 없는 환경에서도 그냥 지나갑니다. 어떤 순서로 실행해도 안전하고,
-- 여러 번 실행해도 됩니다.

do $$
declare
  r record;
  found_any boolean := false;
begin
  if to_regclass('api_logs') is null then
    raise warning 'api_logs 테이블이 없습니다. 이 마이그레이션은 건너뜁니다.';
    return;
  end if;

  for r in
    select conname, pg_get_constraintdef(oid) as def
      from pg_constraint
     where conrelid = 'api_logs'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%provider%'
  loop
    found_any := true;
    if r.def ilike '%seoul%' then
      raise notice '제약 % 에 이미 seoul 이 있습니다 — 그대로 둡니다', r.conname;
    else
      execute format('alter table api_logs drop constraint %I', r.conname);
      raise notice '제약 % 을 seoul 포함으로 교체합니다', r.conname;
      execute 'alter table api_logs add constraint api_logs_provider_check
                 check (provider in (''odsay'', ''kakao'', ''seoul'', ''public''))';
    end if;
  end loop;

  if not found_any then
    raise notice 'provider 체크 제약이 없습니다 — 추가 작업 없음';
  end if;
end $$;
