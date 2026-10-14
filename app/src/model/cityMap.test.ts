import { describe, expect, it } from "vitest";
import { DEFAULT_MATERIALS } from "@strata/core";
import { THICK_RAMP, TREND_RAMP, cityArea, cityPoint, paint, ramp, thickness, type CityGrid } from "./cityMap";
import type { Trend } from "./waterTrend";
import { prepare, type ModelSite } from "./model";
import { CENTRE, east, flatGrid, north, site } from "./testGround";

const flat = flatGrid(120);
/** Three borewells around the centre with the same layers. */
const around = (layers: [number, number, string][], km = 0.5): ModelSite[] => [
  site("a", north(km), east(0), layers), site("b", north(0), east(km), layers), site("c", north(-km * 0.7), east(-km * 0.7), layers),
];
const at = (sites: ModelSite[], lat = CENTRE[0], lon = CENTRE[1]) => cityPoint(lat, lon, prepare(sites, DEFAULT_MATERIALS, flat), flat);

describe("cityPoint", () => {
  it("keeps the likeliest ground and how sure it is, step by step", () => {
    const p = at(around([[0, 50, "clay"], [50, 100, "medium_sand"]]))!;
    expect(p.codes).toHaveLength(20);
    expect(p.codes[0]).toBe(1); // clay, likely
    expect(p.codes[15]).toBe(5); // water-bearing sand, likely
  });

  it("finds the first water-bearing sand at least 10 ft thick", () => {
    const p = at(around([[0, 40, "clay"], [40, 45, "medium_sand"], [45, 60, "clay"], [60, 100, "medium_sand"]]))!;
    expect(p.firstWet).toEqual({ top: 60, level: "likely" });
    expect(at(around([[0, 100, "clay"]]))!.firstWet).toBeNull();
  });

  it("says nothing where the ground height is not known", () => {
    expect(at(around([[0, 100, "clay"]]), 26.5, 80.95)).toBeNull();
  });
});

describe("cityArea", () => {
  it("covers the borewells with 2 km to spare", () => {
    const area = cityArea(prepare(around([[0, 100, "clay"]]), DEFAULT_MATERIALS, flat), flat)!;
    expect(area.north).toBeCloseTo(north(0.5 + 2), 3);
    expect(area.west).toBeCloseTo(east(-0.35 - 2), 3);
  });

  it("stays within the ground-height data, however far off a borewell is", () => {
    // A borewell 80 km away with its own recorded height still votes, but the map stays on the city.
    const sites = [...around([[0, 100, "clay"]]), site("far", 27.6, 81.7, [[0, 100, "clay"]], { groundElevationM: 120 })];
    const area = cityArea(prepare(sites, DEFAULT_MATERIALS, flat), flat)!;
    expect(area.north).toBeLessThanOrEqual(flat.north);
    expect(area.east).toBeLessThanOrEqual(flat.east);
  });

  it("has about 10,000 square cells", () => {
    const area = cityArea(prepare(around([[0, 100, "clay"]]), DEFAULT_MATERIALS, flat), flat)!;
    const w = (area.east - area.west) * 111.32 * Math.cos((CENTRE[0] * Math.PI) / 180) / area.cols, h = (area.north - area.south) * 110.57 / area.rows;
    expect(w / h).toBeCloseTo(1, 1);
    expect(area.cols * area.rows).toBeGreaterThan(9500);
    expect(area.cols * area.rows).toBeLessThanOrEqual(10000);
  });

  it("is null with no borewell that can vote", () => {
    expect(cityArea([], flat)).toBeNull();
  });
});

describe("paint", () => {
  const grid = (codes: number[], firstWet: { top: number; level: "likely" | "rough" } | null = null, trend: Trend | null = null): CityGrid =>
    ({ south: 0, west: 0, north: 1, east: 1, cols: 1, rows: 1, points: [{ codes: Uint8Array.from(codes), firstWet }], trends: [trend] });

  it("colours the ground at a depth, paler where it is a rough guess, and leaves gaps empty", () => {
    expect([...paint(grid([1, 2, 0]), "ground", 0)]).toEqual([0xa0, 0x78, 0x5a, 200]);
    expect(paint(grid([1, 2, 0]), "ground", 5)[3]).toBe(90);
    expect(paint(grid([1, 2, 0]), "ground", 10)[3]).toBe(0);
    expect(paint(grid([1]), "ground", 50)[3]).toBe(0); // below the column
  });

  it("colours the depth to water-bearing sand", () => {
    expect(paint(grid([], { top: 60, level: "rough" }), "wet", 0)[3]).toBe(90);
    expect(paint(grid([], null), "wet", 0)[3]).toBe(0);
  });

  it("shows how sure it is alone, where data is thin", () => {
    expect(paint(grid([5]), "thin", 0)[3]).toBe(200);
    expect(paint(grid([6]), "thin", 0)[3]).toBe(90);
  });

  it("adds up the water-bearing sand down to a depth", () => {
    // Clay, two steps of water-bearing sand (one a rough guess), clay, water-bearing sand.
    const codes = [1, 5, 6, 1, 5];
    expect(thickness(Uint8Array.from(codes), 20)).toEqual({ feet: 10, rough: true });
    expect(thickness(Uint8Array.from(codes), 10)).toEqual({ feet: 5, rough: false });
    expect(thickness(Uint8Array.from(codes), 30)).toBeNull(); // the column ends before 30 ft
    expect(thickness(Uint8Array.from([0, 0, 0, 5]), 20)).toBeNull(); // mostly not enough data
    expect([...paint(grid(codes), "thick", 10)]).toEqual([...ramp(THICK_RAMP, 5), 200]);
    expect(paint(grid(codes), "thick", 20)[3]).toBe(90);
  });

  it("colours how fast the water level changes, pale where it is from different borewells", () => {
    expect([...paint(grid([], null, { ftPerYear: 2, from: "same" }), "trend", 0)]).toEqual([...ramp(TREND_RAMP, 2), 200]);
    expect(paint(grid([], null, { ftPerYear: 2, from: "area" }), "trend", 0)[3]).toBe(90);
    expect(paint(grid([], null, null), "trend", 0)[3]).toBe(0);
  });
});
