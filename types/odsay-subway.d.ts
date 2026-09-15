/**
 * ODsay 지하철 노선도 SDK 최소 타입 선언.
 *
 * 2026-05-28 에 추가된 JavaScript API 입니다. npm 패키지가 없고
 * 런타임에 <script> 로 불러오므로, 여기 있는 것은 **컴파일 시점 선언일 뿐**
 * 입니다. 이 파일이 있다고 SDK 가 들어오는 것이 아닙니다.
 *
 * 문서에 없는 필드는 적지 않았습니다. 필요해지면 실제 응답을 보고 넓히세요.
 */

/** 마커 종류 — 출발(s) · 경유(m) · 도착(e) */
type OdsayMarkerType = "s" | "m" | "e";

interface OdsaySubwayOptions {
  /** 0=국문 1=영문 2=일문 3=중문간체 4=중문번체 */
  lang?: number;
  /** 도시코드. 1000=수도권 7000=부산 4000=대구 5000=광주 3000=대전 */
  CID?: number;
}

interface OdsaySubwayClickPayload {
  /** 0=빈 곳 1=역 */
  type?: number;
  stationID?: number;
  stationCoord?: unknown;
  mouseCoord?: unknown;
  preventContextMenu?: () => void;
}

interface OdsaySubwayMap {
  addMarker(type: OdsayMarkerType, stationID: number): void;
  removeMarker(type: OdsayMarkerType): void;
  hideMarker(type: OdsayMarkerType): void;
  showMarker(type: OdsayMarkerType): void;
  setLang(lang: number): void;
  setCID(CID: number): void;
  addContextMenu(stationID: number, options: unknown): void;
  removeContextMenu(): void;
  /**
   * path_changed — 출발·도착이 모두 정해지면 노선도가 경로를 그리고 부릅니다
   * path_init    — 경로가 그려진 상태에서 빈 곳을 누르면
   * click        — 아무 곳이나 눌렀을 때
   */
  addEvent(eventName: "path_changed", callback: (result: unknown) => void): void;
  addEvent(eventName: "path_init", callback: (coord: unknown) => void): void;
  addEvent(eventName: "click", callback: (payload: OdsaySubwayClickPayload) => void): void;
}

interface OdsaySubwayNamespace {
  maps?: {
    Subway?: new (container: HTMLElement, options?: OdsaySubwayOptions) => OdsaySubwayMap;
  };
}

interface Window {
  odsay?: OdsaySubwayNamespace;
  /** sdk.js 의 callback= 파라미터가 부르는 전역 함수 */
  odsaySubwayReady?: () => void;
}
