-- 경로 API 가 실제로 아는 역명을 기억해 둘 자리를 만듭니다.
--
-- 왜 필요한가
--   역 마스터에는 같은 자리에 이름이 여러 개 들어 있습니다.
--     서울역 위치 → "서울"(sto, 공항철도) · "서울역"(kric 1·4호선) · "서울역(경의선)"
--   이 중 경로 API 가 아는 이름은 "서울역" 하나뿐입니다. "서울" 로 물으면
--   오류도 없이 빈 경로를 돌려줍니다(code 00 · paths []).
--
--   그래서 후보 이름을 순서대로 시험하는데, 매번 시험하면 호출이 낭비됩니다.
--   한 번 통한 이름을 여기에 적어 두고 다음부터 바로 씁니다.
--
-- 이 컬럼은 앱(moveone_api 역할)이 쓰기 때문에 해당 컬럼만 UPDATE 를 허용합니다.
-- 다른 컬럼은 여전히 읽기 전용입니다.

alter table subway_station add column if not exists api_name text;

create index if not exists subway_station_api_name_idx on subway_station (api_name);

comment on column subway_station.api_name is
  '서울교통공사 최단경로 API 가 실제로 인식한 역명. 검색이 성공하면 채워집니다.';

-- 학습 결과를 쓰려면 UPDATE 정책이 필요합니다(RLS 가 켜져 있으므로).
drop policy if exists subway_station_learn on subway_station;
create policy subway_station_learn on subway_station
  for update
  using (true)
  with check (true);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'moveone_app') then
    execute 'grant select on subway_station to moveone_app';
    -- 컬럼 단위 권한입니다. api_name 외에는 여전히 못 바꿉니다.
    execute 'grant update (api_name) on subway_station to moveone_app';
    raise notice 'moveone_app 에 api_name 컬럼 UPDATE 권한을 부여했습니다';
  else
    raise warning '역할 moveone_app 이 없어 권한 부여를 건너뜁니다';
  end if;
end $$;
