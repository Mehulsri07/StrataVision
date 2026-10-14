import { describe, expect, it } from "vitest";
import { DEFAULT_MATERIALS, METRES_TO_FEET, heightAt, type Borewell, type ElevationGrid } from "@strata/core";
import { prepare, type ModelSite } from "./model";
import { sectionAlong } from "./section";
import { CENTRE, east, flatGrid, north, site, slopeGrid } from "./testGround";

const flat = flatGrid(120);
const CLAY: [number, number, string][] = [[0, 200, "clay"]];
const along = (path: [number, number][], sites: ModelSite[], grid: ElevationGrid = flat, halfWidthKm = 0.5, count = 5) =>
  sectionAlong(path, halfWidthKm, prepare(sites, DEFAULT_MATERIALS, grid), grid, sites.map((s) => s.borewell), count);

describe("sectionAlong", () => {
  it("samples evenly along a line with a bend, by distance along the line", () => {
    const s = along([CENTRE, [north(0), east(2)], [north(2), east(2)]], []);
    expect(s.lengthKm).toBeCloseTo(4, 1);
    expect(s.columns.map((c) => c.km)).toEqual([0, 1, 2, 3, 4].map((k) => expect.closeTo(k, 1)));
    expect(s.columns[3].latitude).toBeCloseTo(north(1), 4);
    expect(s.columns[3].longitude).toBeCloseTo(east(2), 4);
    expect(s.bendsKm).toEqual([expect.closeTo(2, 1)]);
  });

  it("lines a layer up by height on sloping ground", () => {
    // Clay down to 330 ft above sea level and water-bearing sand below it, at every borewell, while
    // the ground climbs eastwards: the boundary is deeper below ground in the east.
    const grid = slopeGrid(60, 180);
    const boundaryFt = 330;
    const at = (id: string, lat: number, lon: number) => {
      const groundFt = heightAt(grid, lat, lon)! * METRES_TO_FEET;
      return site(id, lat, lon, [[0, groundFt - boundaryFt, "clay"], [groundFt - boundaryFt, groundFt - boundaryFt + 100, "medium_sand"]]);
    };
    const sites = [at("w", north(0.3), east(-1)), at("m", north(-0.3), east(0)), at("e", north(0.3), east(1))];
    const s = along([[north(0), east(-1)], [north(0), east(1)]], sites, grid);
    for (const c of s.columns) {
      const atHeight = (ft: number) => c.steps!.find((st) => st.top <= c.groundFt! - ft && c.groundFt! - ft < st.bottom)!.likely;
      expect(atHeight(boundaryFt + 10)).toBe("clay");
      expect(atHeight(boundaryFt - 10)).toBe("waterBearing");
    }
    expect(s.columns[4].groundFt! - s.columns[0].groundFt!).toBeGreaterThan(10);
  });

  it("takes only the borewells near the line, in order along it", () => {
    const sites = [site("far", north(0.8), east(0.5), CLAY), site("b", north(-0.3), east(1.5), CLAY), site("a", north(0.2), east(0.5), CLAY)];
    const s = along([CENTRE, [north(0), east(2)]], sites);
    expect(s.borewells.map((b) => b.p.id)).toEqual(["a", "b"]);
    expect(s.borewells[0].alongKm).toBeCloseTo(0.5, 2);
    expect(s.nearby).toBe(2);
  });

  it("leaves a gap where the ground height is not known", () => {
    // The made-up ground ends at latitude 26.6.
    const s = along([[26.59, 80.95], [26.61, 80.95]], [site("a", 26.605, 80.95, CLAY)]);
    expect(s.columns[0]).toMatchObject({ groundFt: null, steps: null });
    expect(s.columns[4].groundFt).toBeCloseTo(120 * METRES_TO_FEET, 1);
  });

  it("gives the expected water level only where there is a recent reading nearby", () => {
    const wet = site("wet", north(0.1), east(0), CLAY, { waterLevel: 40, waterLevelOn: "2026-03-01" } as Partial<Borewell>);
    const s = along([CENTRE, [north(0), east(4)]], [wet]);
    expect(s.columns[0].waterFt).toBeCloseTo(40, 5);
    expect(s.columns[4].waterFt).toBeNull();
  });

  it("is empty for fewer than two points", () => {
    expect(along([CENTRE], [site("a", north(0), east(0), CLAY)])).toEqual({ lengthKm: 0, columns: [], borewells: [], nearby: 0, bendsKm: [] });
  });
});
