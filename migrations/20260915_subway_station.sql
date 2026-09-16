-- 서울 1~8호선 역 마스터
-- 출처: 서울교통공사_1_8호선 역사 좌표(위경도) 정보 (data.go.kr 15099316), 276개 역
-- name_norm 규칙은 lib/routing/stations.ts 의 normalizeStationName() 과 반드시 같아야 한다.
--   1) 괄호와 그 안의 내용 제거   "총신대입구(이수)" -> "총신대입구"
--   2) 모든 공백 제거
--   3) 끝의 "역" 제거            "강남역" -> "강남"

create table if not exists subway_station (
  id                bigserial primary key,
  station_name      text    not null,
  line_name         text    not null,
  ext_station_code  text,
  lat               double precision not null,
  lng               double precision not null,
  -- 괄호 밖 본명:  "총신대입구(이수)" -> "총신대입구",  "강남역" -> "강남"
  name_norm         text generated always as (
    regexp_replace(
      regexp_replace(
        regexp_replace(station_name, '\(.*?\)', '', 'g'),
      '\s', '', 'g'),
    '역$', '')
  ) stored,
  -- 괄호 안 별칭:  "총신대입구(이수)" -> "이수".  괄호가 없으면 NULL.
  -- 사용자는 "이수"로 검색하는 일이 많아 이 컬럼이 없으면 찾지 못한다.
  name_alias        text generated always as (
    regexp_replace(
      regexp_replace(substring(station_name from '\((.*?)\)'), '\s', '', 'g'),
    '역$', '')
  ) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (station_name, line_name)
);

create index if not exists subway_station_name_norm_idx  on subway_station (name_norm);
create index if not exists subway_station_name_alias_idx on subway_station (name_alias);
create index if not exists subway_station_latlng_idx    on subway_station (lat, lng);

-- 역 마스터는 공개 정보라 로그인 사용자 모두가 읽을 수 있게 둔다.
-- (RLS 를 켜둔 다른 테이블과 달리 사용자별 분리가 필요 없다.)
alter table subway_station enable row level security;

drop policy if exists subway_station_read on subway_station;
create policy subway_station_read on subway_station
  for select
  using (true);

-- 런타임 역할이 아직 없는 환경에서도 마이그레이션이 통째로 실패하지 않도록 한다.
-- (역할이 없으면 grant 는 건너뛰고 경고만 남긴다. 역할을 만든 뒤 이 파일을 다시 돌리면 붙는다.)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'moveone_app') then
    execute 'grant select on subway_station to moveone_app';
    execute 'grant usage, select on sequence subway_station_id_seq to moveone_app';
    raise notice 'moveone_app 에 읽기 권한을 부여했습니다.';
  else
    raise warning '역할 moveone_app 이 없어 권한 부여를 건너뜁니다. 역할 생성 후 이 파일을 다시 실행하세요.';
  end if;
end $$;
