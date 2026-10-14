import { describe, expect, it } from "vitest";
import type { Borewell, WaterReading } from "@strata/core";
import { lineThrough, readingsOf, sameBorewellTrends, trendAt } from "./waterTrend";
import { CENTRE, east, north } from "./testGround";

const bw = (id: string, km: number, level: number | null = null, on: string | null = null) =>
  ({ id, borewellId: id.toUpperCase(), latitude: north(0), longitude: east(km), waterLevel: level, waterLevelOn: on }) as Borewell;
const reading = (measuredOn: string, staticLevel: number | null) => ({ measuredOn, staticLevel }) as WaterReading;
const site = (b: Borewell, readings: WaterReading[] = []) => ({ borewell: b, waterReadings: readings });

describe("lineThrough", () => {
  it("gives the change per year of a straight line through the readings", () => {
    expect(lineThrough([{ year: 2020, feet: 40 }, { year: 2022, feet: 46 }, { year: 2024, feet: 52 }])).toBeCloseTo(3, 5);
  });
});

describe("readingsOf", () => {
  it("takes dated readings, or a borewell's own dated level when it has none", () => {
    const r = readingsOf([
      site(bw("a", 0, 50, "2025-06-01"), [reading("2023-01-01", 40), reading("2025-01-01", 44), reading("2024-01-01", null)]),
      site(bw("b", 1, 60, "2024-07-01")),
      site(bw("c", 2, 70, null)),
    ]);
    expect(r.map((x) => [x.id, x.feet])).toEqual([["a", 40], ["a", 44], ["b", 60]]);
    expect(r[0].year).toBeCloseTo(2023, 2);
  });
});

describe("trendAt", () => {
  it("prefers borewells measured more than once, nearer ones counting more", () => {
    const readings = readingsOf([
      site(bw("near", 0.2), [reading("2022-01-01", 40), reading("2024-01-01", 44)]), // +2 a year
      site(bw("far", 1.5), [reading("2022-01-01", 40), reading("2024-01-01", 52)]), // +6 a year
      ...Array.from({ length: 6 }, (_, i) => site(bw(`o${i}`, 0.5, 30, `${2020 + i}-01-01`))),
    ]);
    const t = trendAt(CENTRE[0], CENTRE[1], readings, sameBorewellTrends(readings))!;
    expect(t.from).toBe("same");
    expect(t.ftPerYear).toBeGreaterThan(2);
    expect(t.ftPerYear).toBeLessThan(2.5);
  });

  it("ignores repeat readings less than a year apart", () => {
    const readings = readingsOf([site(bw("a", 0.2), [reading("2024-01-01", 40), reading("2024-06-01", 48)])]);
    expect(sameBorewellTrends(readings)).toEqual([]);
  });

  it("otherwise uses different borewells over the years, if there are enough", () => {
    const readings = readingsOf(Array.from({ length: 5 }, (_, i) => site(bw(`o${i}`, 0.3 * i, 40 + i, `${2021 + i}-01-01`))));
    expect(trendAt(CENTRE[0], CENTRE[1], readings, [])).toMatchObject({ from: "area", ftPerYear: expect.closeTo(1, 3) });
  });

  it("says nothing with fewer than 5 readings or under 2 years", () => {
    const four = readingsOf(Array.from({ length: 4 }, (_, i) => site(bw(`o${i}`, 0.3 * i, 40 + i, `${2021 + i}-01-01`))));
    expect(trendAt(CENTRE[0], CENTRE[1], four, [])).toBeNull();
    const oneYear = readingsOf(Array.from({ length: 6 }, (_, i) => site(bw(`o${i}`, 0.3 * i, 40 + i, `2024-0${i + 1}-01`))));
    expect(trendAt(CENTRE[0], CENTRE[1], oneYear, [])).toBeNull();
  });

  it("looks only within 2 km", () => {
    const readings = readingsOf(Array.from({ length: 6 }, (_, i) => site(bw(`o${i}`, 3 + i * 0.1, 40 + i, `${2020 + i}-01-01`))));
    expect(trendAt(CENTRE[0], CENTRE[1], readings, sameBorewellTrends(readings))).toBeNull();
  });
});
