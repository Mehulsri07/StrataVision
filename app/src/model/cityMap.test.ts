import { describe, expect, it } from "vitest";
import { DEFAULT_MATERIALS } from "@strata/core";
import { cityArea, cityPoint, paint, type CityGrid } from "./cityMap";
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
    const area = cityArea(prepare(around([[0, 100, "clay"]]), DEFAULT_MATERIALS, flat))!;
    expect(area.north).toBeCloseTo(north(0.5 + 2), 3);
    expect(area.west).toBeCloseTo(east(-0.35 - 2), 3);
  });
});

describe("paint", () => {
  const grid = (codes: number[], firstWet: { top: number; level: "likely" | "rough" } | null = null): CityGrid =>
    ({ south: 0, west: 0, north: 1, east: 1, cols: 1, rows: 1, points: [{ codes: Uint8Array.from(codes), firstWet }] });

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
});
