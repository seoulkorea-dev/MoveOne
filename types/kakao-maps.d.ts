/**
 * 카카오맵 JS SDK 최소 타입 선언.
 *
 * 공식 SDK는 타입 패키지를 제공하지 않습니다. 쓰는 것만 좁게 선언해 두면
 * any 없이 컴파일되고, 없는 메서드를 부르는 실수도 잡힙니다.
 * SDK 기능을 새로 쓸 때마다 여기에 한 줄씩 추가하세요.
 *
 * 문서: https://apis.map.kakao.com/web/documentation/
 */
declare namespace kakao.maps {
  /** autoload=false 로 불러온 뒤 이 콜백 안에서 지도 객체를 만듭니다. */
  function load(callback: () => void): void;

  class LatLng {
    constructor(lat: number, lng: number);
    getLat(): number;
    getLng(): number;
  }

  class LatLngBounds {
    constructor();
    extend(latlng: LatLng): void;
    isEmpty(): boolean;
  }

  interface MapOptions {
    center: LatLng;
    level?: number;
    draggable?: boolean;
    scrollwheel?: boolean;
  }

  class Map {
    constructor(container: HTMLElement, options: MapOptions);
    setBounds(bounds: LatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number): void;
    setCenter(latlng: LatLng): void;
    relayout(): void;
  }

  interface PolylineOptions {
    path: LatLng[];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    /** "solid" | "shortdash" | "dot" 등 */
    strokeStyle?: string;
    zIndex?: number;
  }

  class Polyline {
    constructor(options: PolylineOptions);
    setMap(map: Map | null): void;
  }

  interface CustomOverlayOptions {
    position: LatLng;
    content: string | HTMLElement;
    map?: Map;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
  }

  class CustomOverlay {
    constructor(options: CustomOverlayOptions);
    setMap(map: Map | null): void;
  }
}

interface Window {
  kakao?: typeof kakao;
}
