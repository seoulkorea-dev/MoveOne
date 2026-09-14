-- ============================================================
-- MoveOne — 1차 스키마 (수도권 대중교통 경로 검색)
--
-- Notion「[Day8] DB Table 정의서 v1.0」(31개 테이블) 중 1차 범위에
-- 해당하는 테이블만 옮기고, MySQL → PostgreSQL로 변환했습니다.
--
-- 원본에서 바꾼 것과 그 이유:
--   1. DATETIME            → timestamptz
--      시간대 정보가 없는 타입은 서버 위치가 바뀌면 값이 틀어집니다.
--      MoveOne은 출발·도착·지연 시각이 제품의 핵심이라 치명적입니다.
--      저장은 UTC, 표시는 KST (lib/kst.ts).
--   2. TINYINT 코드값      → text + CHECK
--      segment_type = 2 보다 'subway' 가 읽힙니다.
--   3. BIGINT AUTO_INCREMENT → bigint generated always as identity
--   4. JSON                → jsonb
--   5. CURRENT_TIMESTAMP ON UPDATE → 트리거 (Postgres에는 해당 문법이 없음)
--   6. user_profiles.home_location_id → transit_stations.id (FK) 제거
--      캐시 테이블을 사용자 데이터가 참조하면, 캐시를 갱신하는 순간
--      사용자 데이터가 깨집니다. 위치는 jsonb 값으로 복사해 보관합니다.
--   7. station_external_ids 신규
--      ODsay와 공공데이터포털은 정류장 ID 체계가 다릅니다. 2차에서
--      실시간 도착정보를 붙이려면 반드시 필요하므로 지금 자리를 잡습니다.
--
-- 멱등합니다. 여러 번 실행해도 안전합니다.
-- ============================================================

-- ------------------------------------------------------------
-- 공통: updated_at 자동 갱신 트리거
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ============================================================
-- 1. 회원
-- ============================================================

create table if not exists users (
  id          bigint generated always as identity primary key,
  nickname    text,
  status      text        not null default 'active'
                          check (status in ('active', 'inactive', 'deleted')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_users_status     on users (status);
create index if not exists idx_users_created_at on users (created_at);

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();


-- 인증 정보를 users에서 분리해 둡니다.
-- 1차는 provider='local' 뿐이지만, 2차에서 카카오·구글을 붙일 때
-- 같은 사용자에 행을 하나 더 넣으면 되도록 설계했습니다.
create table if not exists user_auth (
  id               bigint generated always as identity primary key,
  user_id          bigint      not null references users(id) on delete cascade,
  provider         text        not null
                               check (provider in ('local','kakao','naver','google','apple')),
  provider_user_id text        not null,   -- local이면 로그인 아이디
  password_hash    text,                   -- local 전용. scrypt 단방향 해시
  last_login_at    timestamptz,
  login_count      integer     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (provider, provider_user_id)
);

create index if not exists idx_user_auth_user_id on user_auth (user_id);

drop trigger if exists trg_user_auth_updated_at on user_auth;
create trigger trg_user_auth_updated_at before update on user_auth
  for each row execute function set_updated_at();


-- 이동 조건 설정 (유저플로우 s2의 "이동 조건 설정 화면")
-- 정의서의 user_profiles에서 1차에 필요한 것만 남기고,
-- 집·회사 위치는 정류장 ID가 아니라 값(jsonb)으로 보관합니다.
create table if not exists user_preferences (
  user_id             bigint      primary key references users(id) on delete cascade,
  home_location       jsonb,      -- {lat, lng, address, name}
  work_location       jsonb,
  excluded_modes      text[]      not null default '{}',   -- 예: {'taxi','bike'}
  priority            text        not null default 'fastest'
                                  check (priority in ('fastest','cheapest','fewest_transfers','least_walk')),
  accessibility_mode  boolean     not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists trg_user_preferences_updated_at on user_preferences;
create trigger trg_user_preferences_updated_at before update on user_preferences
  for each row execute function set_updated_at();


-- ============================================================
-- 2. 검색 — 기획서 KPI(검색 완료율·선택률)의 원천
-- ============================================================

create table if not exists searches (
  id                  bigint generated always as identity primary key,
  user_id             bigint      references users(id) on delete set null,  -- 비로그인 허용
  session_id          text,                                                -- 비로그인 추적
  departure_location  jsonb       not null,   -- {lat, lng, address, name}
  arrival_location    jsonb       not null,
  departure_time      timestamptz,
  search_type         text        not null default 'immediate'
                                  check (search_type in ('immediate','scheduled','commute')),
  excluded_modes      text[]      not null default '{}',
  accessibility_mode  boolean     not null default false,
  result_count        integer     not null default 0,   -- KPI: 검색 완료율
  selected_route_id   bigint,                           -- KPI: 선택률. FK는 아래에서 별도 추가
  search_duration_ms  integer,                          -- 성능 측정
  cache_hit           boolean     not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists idx_searches_user_id    on searches (user_id);
create index if not exists idx_searches_session_id on searches (session_id);
create index if not exists idx_searches_created_at on searches (created_at desc);


create table if not exists search_routes (
  id                bigint generated always as identity primary key,
  search_id         bigint      not null references searches(id) on delete cascade,
  route_index       integer     not null default 0,
  route_type        text        not null default 'recommended'
                                check (route_type in ('fastest','fewest_transfers','cheapest','recommended')),
  total_time        integer     not null,   -- 분
  total_distance    integer,                -- m
  total_walk        integer,                -- m
  total_fare        integer,                -- 원
  transfer_count    integer     not null default 0,
  odsay_path_type   integer,                -- ODsay pathType 원본 (1:지하철 2:버스 3:복합)
  raw               jsonb,                  -- ODsay 원본 path 객체. 디버깅·재현용
  created_at        timestamptz not null default now()
);

create index if not exists idx_search_routes_search_id on search_routes (search_id, route_index);


-- searches.selected_route_id → search_routes.id
-- 두 테이블이 서로를 참조하므로 테이블 생성 후에 제약을 겁니다.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_searches_selected_route'
  ) then
    alter table searches
      add constraint fk_searches_selected_route
      foreign key (selected_route_id) references search_routes(id) on delete set null;
  end if;
end $$;


create table if not exists search_route_segments (
  id                    bigint generated always as identity primary key,
  route_id              bigint      not null references search_routes(id) on delete cascade,
  segment_index         integer     not null default 0,
  segment_type          text        not null
                                    check (segment_type in ('walk','subway','bus','bike','taxi')),
  -- 정류장은 캐시 테이블을 FK로 걸지 않고 이름·좌표를 복사해 둡니다.
  -- 캐시를 비워도 과거 검색 기록이 그대로 남아야 하기 때문입니다.
  start_name            text,
  start_lat             numeric(10,7),
  start_lng             numeric(10,7),
  end_name              text,
  end_lat               numeric(10,7),
  end_lng               numeric(10,7),
  lane_name             text,        -- "수도권 2호선", "간선 472"
  duration              integer,     -- 분
  distance              integer,     -- m
  station_count         integer,
  odsay_start_station_id text,       -- 2차에서 실시간 정보를 붙일 때 쓰는 열쇠
  odsay_end_station_id   text,
  created_at            timestamptz not null default now()
);

create index if not exists idx_segments_route_id
  on search_route_segments (route_id, segment_index);


-- ============================================================
-- 3. 교통 데이터 캐시
--    외부에서 받아와 채우는 테이블입니다. 언제든 비우고 다시 채울 수
--    있어야 하므로, 사용자 테이블이 이 테이블들을 FK로 참조하지 않습니다.
-- ============================================================

create table if not exists transit_stations (
  id            bigint generated always as identity primary key,
  station_name  text        not null,
  station_type  text        not null
                            check (station_type in ('subway','bus','train','bike')),
  lat           numeric(10,7) not null,
  lng           numeric(10,7) not null,
  address       text,
  city_code     integer,
  is_active     boolean     not null default true,
  fetched_at    timestamptz not null default now(),  -- 캐시 신선도
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_transit_stations_name     on transit_stations (station_name);
create index if not exists idx_transit_stations_type     on transit_stations (station_type);
create index if not exists idx_transit_stations_location on transit_stations (lat, lng);

drop trigger if exists trg_transit_stations_updated_at on transit_stations;
create trigger trg_transit_stations_updated_at before update on transit_stations
  for each row execute function set_updated_at();


-- 같은 정류장을 기관마다 다른 ID로 부릅니다.
-- ODsay: 216 / 서울 TOPIS: 23001 / 공공데이터포털: ...
-- 2차에서 실시간 도착정보를 붙이려면 이 매핑이 반드시 필요합니다.
create table if not exists station_external_ids (
  id          bigint generated always as identity primary key,
  station_id  bigint      not null references transit_stations(id) on delete cascade,
  source      text        not null
                          check (source in ('odsay','seoul_topis','gbis','data_go_kr')),
  external_id text        not null,
  created_at  timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists idx_station_external_ids_station on station_external_ids (station_id);


create table if not exists transit_routes (
  id            bigint generated always as identity primary key,
  route_name    text        not null,   -- "2호선", "472"
  route_type    text        not null
                            check (route_type in ('subway','bus','train','bike')),
  operator      text,
  city_code     integer,
  is_active     boolean     not null default true,
  fetched_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_transit_routes_name on transit_routes (route_name);
create index if not exists idx_transit_routes_type on transit_routes (route_type);

drop trigger if exists trg_transit_routes_updated_at on transit_routes;
create trigger trg_transit_routes_updated_at before update on transit_routes
  for each row execute function set_updated_at();


-- 경로 검색 결과 캐시.
-- 같은 출발·도착·조건이면 ODsay를 다시 호출하지 않습니다.
-- ODsay 호출 한도가 문서에 명시되지 않아 캐싱이 필수입니다.
create table if not exists route_cache (
  cache_key   text        primary key,   -- 좌표+조건을 해시한 값
  payload     jsonb       not null,      -- 정규화된 경로 목록
  hit_count   integer     not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists idx_route_cache_expires on route_cache (expires_at);


-- ============================================================
-- 4. 운영 — 외부 API 호출 로그
--    캐시 적중률과 ODsay 호출량을 여기서 계산합니다.
-- ============================================================

create table if not exists api_logs (
  id               bigint generated always as identity primary key,
  provider         text        not null,   -- 'odsay' | 'kakao'
  endpoint         text        not null,
  status_code      integer,
  response_time_ms integer,
  cache_hit        boolean     not null default false,
  error_message    text,
  user_id          bigint      references users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_api_logs_provider   on api_logs (provider, created_at desc);
create index if not exists idx_api_logs_created_at on api_logs (created_at desc);
