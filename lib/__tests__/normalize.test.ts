import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeLanes, normalizePaths } from "@/lib/odsay/normalize";
import type { OdsaySearchPathResponse } from "@/lib/odsay/types";
import { sortRoutes } from "@/lib/routes";

/**
 * 저장해 둔 실제 응답 샘플로 검증합니다.
 * ODsay를 호출하지 않으므로 호출 한도를 쓰지 않고, 빠르며, 오프라인에서도 돕니다.
 *
 * P0에서 실제 응답을 받으면 fixtures/odsay/*.json 을 교체하세요.
 * 구조가 달라졌다면 이 테스트가 바로 실패해서 알려줍니다.
 */

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures/odsay/gangnam-pangyo.json"), "utf8"),
) as OdsaySearchPathResponse;

describe("normalizePaths", () => {
  const routes = normalizePaths(fixture.result?.path);

  it("경로를 모두 파싱한다", () => {
    expect(routes).toHaveLength(2);
  });

  it("소요 시간과 요금을 그대로 옮긴다", () => {
    expect(routes[0].totalTimeMin).toBe(41);
    expect(routes[0].totalFare).toBe(2150);
    expect(routes[0].totalWalkM).toBe(760);
  });

  it("환승 횟수는 탑승 횟수에서 1을 뺀 값이다", () => {
    // 지하철만 1회 탑승 → 환승 0회
    expect(routes[0].transferCount).toBe(0);
    // 버스 1회 + 지하철 1회 = 2회 탑승 → 환승 1회
    expect(routes[1].transferCount).toBe(1);
  });

  it("지하철은 lane.name, 버스는 lane.busNo 를 노선명으로 쓴다", () => {
    expect(routes[0].segments[1].laneName).toBe("신분당선");
    expect(routes[1].segments[1].laneName).toBe("440");
    expect(routes[0].segments[0].laneName).toBeUndefined(); // 도보
  });

  it("ODsay의 X는 경도, Y는 위도다", () => {
    const segment = routes[0].segments[1];
    expect(segment.start?.lat).toBeCloseTo(37.497942, 5);
    expect(segment.start?.lng).toBeCloseTo(127.027621, 5);
  });

  it("정류장 ID를 문자열로 보관한다", () => {
    // 공공데이터포털 ID에는 영문이 섞이므로 문자열이 안전하다
    expect(routes[0].segments[1].odsayStartStationId).toBe("4307");
  });

  it("정차역 좌표를 숫자로 바꿔 담는다", () => {
    // ODsay는 정차역 x/y를 문자열로 준다. 지도 폴리라인이 이 값을 쓴다.
    const stops = routes[0].segments[1].stops;
    expect(stops).toBeDefined();
    expect(stops!.length).toBeGreaterThanOrEqual(2);
    expect(typeof stops![0].lat).toBe("number");
    expect(stops![0].name).toBe("강남");
    expect(stops![0].lat).toBeCloseTo(37.497942, 5);
    expect(stops![0].lng).toBeCloseTo(127.027621, 5);
  });

  it("도보 구간에는 정차역이 없다", () => {
    expect(routes[0].segments[0].stops).toBeUndefined();
  });
});

describe("normalizePaths — 방어", () => {
  it("path가 없거나 배열이 아니어도 예외를 던지지 않는다", () => {
    expect(normalizePaths(undefined)).toEqual([]);
    expect(normalizePaths(null as never)).toEqual([]);
  });

  it("소요 시간이 없는 경로는 버린다", () => {
    expect(normalizePaths([{}])).toEqual([]);
  });

  it("모르는 trafficType은 도보로 처리한다", () => {
    const routes = normalizePaths([
      { info: { totalTime: 10 }, subPath: [{ trafficType: 99 }] },
    ]);
    expect(routes[0].segments[0].type).toBe("walk");
  });

  it("요금이 없으면 0이 아니라 null이다", () => {
    // 0원과 "모름"은 다릅니다. 화면에서 "요금 정보 없음"으로 표시됩니다.
    const routes = normalizePaths([{ info: { totalTime: 10 }, subPath: [] }]);
    expect(routes[0].totalFare).toBeNull();
  });
});

describe("sortRoutes", () => {
  const routes = normalizePaths(fixture.result?.path);

  it("네 가지 정렬이 서로 다른 결과를 만든다", () => {
    expect(sortRoutes(routes, "fastest")[0].index).toBe(0);
    expect(sortRoutes(routes, "cheapest")[0].index).toBe(1);
    expect(sortRoutes(routes, "fewest_transfers")[0].index).toBe(0);
    expect(sortRoutes(routes, "least_walk")[0].index).toBe(0);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const before = routes.map((r) => r.index);
    sortRoutes(routes, "cheapest");
    expect(routes.map((r) => r.index)).toEqual(before);
  });

  it("요금을 모르는 경로는 저렴한 순에서 뒤로 밀린다", () => {
    const mixed = normalizePaths([
      { info: { totalTime: 30 }, subPath: [] },
      { info: { totalTime: 50, payment: 1500 }, subPath: [] },
    ]);
    expect(sortRoutes(mixed, "cheapest")[0].totalFare).toBe(1500);
  });
});

describe("정차역 정규화 — 방어", () => {
  it("좌표가 깨진 역은 버리고 나머지는 살린다", () => {
    // 역 하나 때문에 폴리라인이 엉뚱한 곳으로 튀면 안 됩니다.
    const routes = normalizePaths([
      {
        info: { totalTime: 10 },
        subPath: [
          {
            trafficType: 1,
            passStopList: {
              stations: [
                { stationName: "정상", x: "127.0", y: "37.5" },
                { stationName: "깨짐", x: "없음", y: "37.5" },
                { stationName: "정상2", x: "127.1", y: "37.6" },
              ],
            },
          },
        ],
      },
    ]);
    const stops = routes[0].segments[0].stops;
    expect(stops).toHaveLength(2);
    expect(stops!.map((s) => s.name)).toEqual(["정상", "정상2"]);
  });

  it("정차역이 하나도 쓸 수 없으면 undefined 다", () => {
    const routes = normalizePaths([
      {
        info: { totalTime: 10 },
        subPath: [{ trafficType: 2, passStopList: { stations: [{ x: "", y: "" }] } }],
      },
    ]);
    expect(routes[0].segments[0].stops).toBeUndefined();
  });
});

describe("normalizeLanes — 노선 선형", () => {
  it("graphPos 를 위도·경도로 뒤집어 담는다", () => {
    // ODsay 는 x 가 경도, y 가 위도입니다. 지도 라이브러리는 (위도, 경도) 순서라
    // 여기서 뒤집지 않으면 선이 서해 한가운데에 그려집니다.
    const lanes = normalizeLanes({
      result: {
        lane: [
          {
            section: [
              {
                graphPos: [
                  { x: 127.0276, y: 37.4979 },
                  { x: "127.1112", y: "37.3948" },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(lanes).toHaveLength(1);
    expect(lanes[0][0]).toEqual({ lat: 37.4979, lng: 127.0276 });
    expect(lanes[0][1].lat).toBeCloseTo(37.3948, 4);
  });

  it("점이 둘 미만인 구간은 버린다", () => {
    const lanes = normalizeLanes({
      result: { lane: [{ section: [{ graphPos: [{ x: 127, y: 37 }] }] }] },
    });
    expect(lanes).toEqual([]);
  });

  it("좌표가 깨진 점만 버리고 나머지는 살린다", () => {
    const lanes = normalizeLanes({
      result: {
        lane: [
          {
            section: [
              {
                graphPos: [
                  { x: 127.0, y: 37.5 },
                  { x: "없음", y: "37.5" },
                  { x: 127.1, y: 37.6 },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(lanes[0]).toHaveLength(2);
  });

  it("응답이 비었거나 모양이 달라도 예외를 던지지 않는다", () => {
    expect(normalizeLanes(undefined)).toEqual([]);
    expect(normalizeLanes({})).toEqual([]);
    expect(normalizeLanes({ result: {} })).toEqual([]);
  });
});
