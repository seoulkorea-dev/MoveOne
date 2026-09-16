-- 노선별 경유 정류장 캐시.
--
-- 왜 필요한가
--   대중교통환승경로 API(15000414)는 탑승 구간마다 승차·하차 정류소 두 점만 줍니다.
--   그 두 점만 이으면 지도에 직선이 그려집니다. 실제 노선 모양을 그리려면
--   노선정보조회 API(15000193)의 getStaionByRoute 로 경유 정류장을 받아야 합니다.
--
--   그런데 그 호출은 1일 1,000회 한도를 씁니다. 경로 한 건에 탑승 구간이
--   2~3개면 검색 한 번에 3회입니다. 노선 정류장 목록은 거의 바뀌지 않으므로
--   한 번 받아 여기에 두고 다음부터는 DB 에서 읽습니다.
--
-- 2026-09-16 실측 규모
--   604번 89개 · 9000-1광주 86개 · 1400인천 36개.
--   수도권 전체를 다 채워도 수십만 행 수준이라 테이블은 가볍습니다.
--
-- 좌표계는 WGS84 입니다(gpsX=경도, gpsY=위도). 응답의 posX/posY(TM)는 쓰지 않습니다.

create table if not exists bus_route_stop (
  route_id     text    not null,
  seq          integer not null,
  station_id   text    not null,
  ars_id       text,
  station_name text    not null,
  lat          double precision not null,
  lng          double precision not null,
  primary key (route_id, seq)
);

-- 승차 정류소(fid)·하차 정류소(tid)로 seq 를 찾는 것이 유일한 조회 패턴입니다.
create index if not exists bus_route_stop_lookup_idx
  on bus_route_stop (route_id, station_id);

comment on table bus_route_stop is
  '서울시 노선정보조회 getStaionByRoute 결과 캐시. 경로 폴리라인의 원천입니다.';

-- 노선 단위 메타. 언제 받았는지가 있어야 갱신 시점을 정할 수 있습니다.
create table if not exists bus_route_meta (
  route_id   text primary key,
  route_name text,
  route_type smallint,
  stop_count integer not null default 0,
  fetched_at timestamptz not null default now()
);

comment on column bus_route_meta.route_type is
  'TOPIS 노선유형. 3=간선 4=지선 5=순환 6=광역 7=인천 8=경기 (실측 확인분)';

-- RLS. 이 두 테이블은 사용자별 데이터가 아니라 공용 참조 데이터입니다.
-- 그래도 RLS 를 켜 두는 이유는 프로젝트 전체가 켜져 있어서, 하나만 꺼두면
-- 나중에 "왜 이 테이블만 다르지" 를 다시 조사하게 되기 때문입니다.
alter table bus_route_stop enable row level security;
alter table bus_route_meta enable row level security;

drop policy if exists bus_route_stop_all on bus_route_stop;
create policy bus_route_stop_all on bus_route_stop
  for all using (true) with check (true);

drop policy if exists bus_route_meta_all on bus_route_meta;
create policy bus_route_meta_all on bus_route_meta
  for all using (true) with check (true);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'moveone_app') then
    -- 앱이 직접 적재합니다. 캐시가 비면 채워야 하므로 insert/update 가 필요합니다.
    execute 'grant select, insert, update, delete on bus_route_stop to moveone_app';
    execute 'grant select, insert, update, delete on bus_route_meta to moveone_app';
    raise notice 'moveone_app 에 bus_route_stop / bus_route_meta 권한을 부여했습니다';
  else
    raise warning '역할 moveone_app 이 없어 권한 부여를 건너뜁니다';
  end if;
end $$;

-- api_logs.provider 는 기존 제약(odsay/kakao/seoul/public)을 그대로 씁니다.
-- 버스도 provider='seoul' 로 남기고 endpoint 로 구분합니다
-- (/getPathInfoByBus · /getPathInfoByBusNSub · /getStaionByRoute).
-- 값을 하나 더 늘리면 제약을 또 갈아야 하는데, 얻는 것이 없습니다.
