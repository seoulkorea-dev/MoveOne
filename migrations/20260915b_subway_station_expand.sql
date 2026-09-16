-- 역 마스터를 수도권 전체(국가철도공단 도시광역철도 역사정보)로 확장한다.
-- 경로 API 커버리지가 서울 1~8호선을 넘어 수인분당선·경의선·공항철도·신분당선까지
-- 닿는다는 것이 2026-09-15 실측으로 확인되어, 마스터도 같은 범위로 넓힌다.
--
-- 20260915_subway_station.sql 을 먼저 실행한 뒤 이 파일을 실행할 것.

alter table subway_station add column if not exists operator text;   -- 운영기관명
alter table subway_station add column if not exists line_no  text;   -- 노선번호
-- 어느 데이터셋에서 온 행인지. 시드 스크립트가 같은 source 행만 갈아끼운다.
alter table subway_station add column if not exists source   text not null default 'sto';

create index if not exists subway_station_source_idx on subway_station (source);

-- 같은 역이 여러 출처에서 들어올 수 있으므로 유일 제약을 출처까지 포함하도록 바꾼다.
alter table subway_station drop constraint if exists subway_station_station_name_line_name_key;
create unique index if not exists subway_station_uniq
  on subway_station (source, station_name, line_name);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'moveone_app') then
    execute 'grant select on subway_station to moveone_app';
    raise notice 'moveone_app 읽기 권한 확인';
  else
    raise warning '역할 moveone_app 이 없어 권한 부여를 건너뜁니다.';
  end if;
end $$;
