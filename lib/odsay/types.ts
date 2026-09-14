/**
 * ODsay 응답의 "원본" 타입.
 *
 * 주의: 이 타입은 ODsay 공식 문서를 근거로 작성했습니다.
 * P0에서 실제 응답을 받아 fixtures/odsay/ 에 저장한 뒤,
 * 차이가 있으면 여기만 고치면 됩니다 — 화면 코드는 손대지 않습니다.
 * 그러라고 lib/routes.ts 의 도메인 타입과 분리해 두었습니다.
 *
 * 모든 필드를 optional로 둔 이유: 외부 API가 필드를 빠뜨려도
 * 앱이 죽지 않아야 합니다. 정규화 단계에서 기본값을 채웁니다.
 */

/** ODsay trafficType 코드 */
export const ODSAY_TRAFFIC_TYPE = {
  SUBWAY: 1,
  BUS: 2,
  WALK: 3,
} as const;

export type OdsayLane = {
  name?: string;        // 지하철: "수도권 2호선"
  busNo?: string;       // 버스: "472"
  type?: number;        // 버스 종류
  subwayCode?: number;
  busID?: number;
  busLocalBlID?: string;
};

export type OdsayStation = {
  index?: number;
  stationID?: number;
  stationName?: string;
  x?: string;           // 경도. 문자열로 옵니다
  y?: string;           // 위도
};

export type OdsaySubPath = {
  trafficType?: number;     // 1:지하철 2:버스 3:도보
  distance?: number;        // m
  sectionTime?: number;     // 분
  stationCount?: number;
  lane?: OdsayLane[];
  intervalTime?: number;
  startName?: string;
  startX?: number;          // 경도
  startY?: number;          // 위도
  endName?: string;
  endX?: number;
  endY?: number;
  startID?: number;
  endID?: number;
  startExitNo?: string;
  way?: string;
  wayCode?: number;
  door?: string;
  passStopList?: { stations?: OdsayStation[] };
};

export type OdsayPathInfo = {
  totalTime?: number;           // 분
  payment?: number;             // 원
  busTransitCount?: number;
  subwayTransitCount?: number;
  totalWalk?: number;           // m
  totalWalkTime?: number;       // 분
  totalDistance?: number;       // m
  trafficDistance?: number;
  firstStartStation?: string;
  lastEndStation?: string;
  totalStationCount?: number;
  mapObj?: string;              // 노선 그래픽 데이터 조회용 키 (P3 지도에서 사용)
};

export type OdsayPath = {
  pathType?: number;            // 1:지하철 2:버스 3:지하철+버스
  info?: OdsayPathInfo;
  subPath?: OdsaySubPath[];
};

export type OdsaySearchPathResponse = {
  result?: {
    searchType?: number;
    outTrafficCheck?: number;   // 1이면 검색 반경 밖
    busCount?: number;
    subwayCount?: number;
    subwayBusCount?: number;
    pointDistance?: number;
    startRadius?: number;
    endRadius?: number;
    path?: OdsayPath[];
  };
  /** 오류는 result 대신 이 필드로 옵니다 */
  error?: {
    code?: string;
    msg?: string;
  };
};

/* ============================================================
   loadLane — 노선 그래픽 데이터
   searchPubTransPathT 가 준 info.mapObj 로 조회합니다.
   가이드: https://lab.odsay.com/guide/guide#guideWeb_1
   ============================================================ */

/** 좌표. ODsay가 숫자로 줄 때도 문자열로 줄 때도 있어 둘 다 받습니다. */
export type OdsayGraphPos = {
  x?: number | string;
  y?: number | string;
};

export type OdsayLaneSection = {
  graphPos?: OdsayGraphPos[];
};

export type OdsayLaneGraphic = {
  /** 수단 구분. 문서에 표가 없어 값이 와도 그대로 믿지 않습니다 */
  class?: number;
  type?: number;
  section?: OdsayLaneSection[];
};

export type OdsayLoadLaneResponse = {
  result?: {
    lane?: OdsayLaneGraphic[];
    boundary?: unknown;
  };
  error?: { code?: string; msg?: string };
};
