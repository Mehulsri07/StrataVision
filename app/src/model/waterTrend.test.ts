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
    expect(r.map((x) => [x.id, x.feet])).toEqual([["a", 40], ["a", 44], ["a", 50], ["b", 60]]);
    expect(r[0].year).toBeCloseTo(2023, 2);
  });

  it("keeps a borewell's own level when its readings only have the level with the pump running", () => {
    const r = readingsOf([site(bw("a", 0, 50, "2023-06-01"), [{ measuredOn: "2026-01-01", staticLevel: null, dynamicLevel: 80 } as WaterReading])]);
    expect(r.map((x) => x.feet)).toEqual([50]);
  });

  it("does not count the newest reading twice", () => {
    const r = readingsOf([site(bw("a", 0, 44, "2025-01-01"), [reading("2023-01-01", 40), reading("2025-01-01", 44)])]);
    expect(r).toHaveLength(2);
  });

  it("reads dates with spaces around them", () => {
    expect(readingsOf([site(bw("a", 0, 50, " 2024-01-01 "))])).toHaveLength(1);
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

  it("compares the same season, so the rise after the monsoon is not taken for a trend", () => {
    // Each May the water is at 50 ft, each October at 30 ft: no change from year to year.
    const readings = readingsOf([site(bw("a", 0.2), [reading("2023-05-01", 50), reading("2023-10-15", 30), reading("2024-05-10", 50), reading("2024-10-20", 30)])]);
    expect(sameBorewellTrends(readings)).toEqual([expect.objectContaining({ ftPerYear: expect.closeTo(0, 1), seasons: "same" })]);
  });

  it("falls back to readings in different seasons as a rough guess", () => {
    const mixed = readingsOf([site(bw("a", 0.2), [reading("2023-05-01", 50), reading("2024-10-15", 30)])]);
    expect(sameBorewellTrends(mixed)).toEqual([expect.objectContaining({ seasons: "mixed" })]);
    expect(trendAt(CENTRE[0], CENTRE[1], mixed, sameBorewellTrends(mixed))).toMatchObject({ from: "mixed" });
    // A same-season borewell nearby wins over it.
    const both = [...mixed, ...readingsOf([site(bw("b", 1.5), [reading("2022-11-01", 30), reading("2024-11-01", 34)])])];
    expect(trendAt(CENTRE[0], CENTRE[1], both, sameBorewellTrends(both))).toEqual({ from: "same", ftPerYear: expect.closeTo(2, 1) });
  });

  it("ignores repeat readings less than a year apart", () => {
    const readings = readingsOf([site(bw("a", 0.2), [reading("2024-01-01", 40), reading("2024-06-01", 48)])]);
    expect(sameBorewellTrends(readings)).toEqual([]);
  });

  it("otherwise uses different borewells over the years, if there are enough", () => {
    const readings = readingsOf(Array.from({ length: 15 }, (_, i) => site(bw(`o${i}`, 0.1 * i, 40 + (i % 5), `${2021 + (i % 5)}-01-01`))));
    expect(trendAt(CENTRE[0], CENTRE[1], readings, [])).toMatchObject({ from: "area", ftPerYear: expect.closeTo(1, 3) });
  });

  it("says nothing with fewer than 15 readings or under 2 years", () => {
    // Different wells differ by far more than a few years' change, so a handful of them says nothing.
    const few = readingsOf(Array.from({ length: 14 }, (_, i) => site(bw(`o${i}`, 0.1 * i, 40 + i, `${2021 + (i % 5)}-01-01`))));
    expect(trendAt(CENTRE[0], CENTRE[1], few, [])).toBeNull();
    const oneYear = readingsOf(Array.from({ length: 16 }, (_, i) => site(bw(`o${i}`, 0.1 * i, 40 + i, `2024-0${1 + (i % 9)}-01`))));
    expect(trendAt(CENTRE[0], CENTRE[1], oneYear, [])).toBeNull();
  });

  it("looks only within 2 km", () => {
    const readings = readingsOf(Array.from({ length: 6 }, (_, i) => site(bw(`o${i}`, 3 + i * 0.1, 40 + i, `${2020 + i}-01-01`))));
    expect(trendAt(CENTRE[0], CENTRE[1], readings, sameBorewellTrends(readings))).toBeNull();
  });
});
