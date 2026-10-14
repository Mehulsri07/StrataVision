import { describe, expect, it } from "vitest";
import type { PipeSegment } from "@strata/core";
import { nearbyWells, suggestDrilling, type NearbyWell, type SiteWithPipes } from "./drilling";
import type { Group } from "./groups";
import type { Step } from "./model";
import { CENTRE, east, flatGrid, north, site, slopeGrid } from "./testGround";

const flat = flatGrid(120);
const pipe = (startDepth: number, endDepth: number, pipeType: "plain" | "slotted" = "slotted") => ({ startDepth, endDepth, pipeType }) as PipeSegment;
const well = (id: string, lat: number, lon: number, over: Parameters<typeof site>[4] = {}, pipes: PipeSegment[] = []): SiteWithPipes =>
  ({ ...site(id, lat, lon, [[0, 100, "clay"]], over), pipes });
const near = (sites: SiteWithPipes[], grid = flat) => nearbyWells(CENTRE[0], CENTRE[1], sites, grid);

describe("nearbyWells", () => {
  it("takes the 5 nearest sites within 3 km, a crowded site once", () => {
    const crowd = Array.from({ length: 6 }, (_, i) => well(`c${i}`, north(i * 0.005), east(0.5)));
    const others = [1, 1.5, 2, 2.5, 2.8].map((km, i) => well(`o${i}`, north(0), east(-km)));
    const got = near([...crowd, ...others, well("far", north(3.5), east(0))]);
    expect(got.map((w) => w.id)).toEqual(["c0", "o0", "o1", "o2", "o3"]);
    expect(got[1].km).toBeCloseTo(1, 2);
  });

  it("moves a nearby borewell's slotted pipe to the same height at the picked spot", () => {
    // The ground climbs eastwards; a borewell 2 km east stands 15.85 ft higher than the spot.
    const got = near([well("east", north(0), east(2), {}, [pipe(0, 100, "plain"), pipe(100, 120)])], slopeGrid(60, 180));
    expect(got[0].slotted).toHaveLength(1);
    expect(got[0].slotted[0].top).toBeCloseTo(84.15, 1);
    expect(got[0].slotted[0].bottom).toBeCloseTo(104.15, 1);
  });

  it("converts the depth of an old record kept in metres, and nothing else", () => {
    const [w] = near([well("old", north(0), east(0.5), { depthUnit: "m", totalDepth: 100, pumpLowering: 120 }, [pipe(80, 100)])]);
    expect(w.drilledFt).toBeCloseTo(328.08, 1);
    expect(w.pumpFt).toBe(120);
    expect(w.slotted[0]).toMatchObject({ top: 80, bottom: 100 });
  });

  it("leaves out what was not recorded", () => {
    const [w] = near([well("bare", north(0), east(0.5), { totalDepth: null, pumpLowering: null })]);
    expect(w).toMatchObject({ drilledFt: null, pumpFt: null, slotted: [] });
  });

  it("finds nobody beyond 3 km", () => {
    expect(near([well("far", north(4), east(0))])).toEqual([]);
  });
});

const step = (top: number, likely: Group | null, confidence: Step["confidence"] = likely ? "likely" : "none"): Step =>
  ({ top, bottom: top + 5, shares: null, likely, confidence, sources: [] });
/** Steps from `top` to `bottom` in 5 ft. */
const run = (top: number, bottom: number, likely: Group | null, confidence?: Step["confidence"]) =>
  Array.from({ length: (bottom - top) / 5 }, (_, i) => step(top + 5 * i, likely, confidence));
const water = (feet: number) => ({ feet, nearestKm: 0.4, since: "2023" });
const nb = (drilledFt: number | null, pumpFt: number | null = null): NearbyWell => ({ id: `n${drilledFt}`, borewellId: "N", km: 0.5, drilledFt, pumpFt, slotted: [] });

const COLUMN = [
  ...run(0, 40, "clay"), ...run(40, 80, "waterBearing"), ...run(80, 90, "clay"), ...run(90, 95, "waterBearing", "rough"),
  ...run(95, 120, "clay"), ...run(120, 150, "waterBearing", "rough"), ...run(150, 160, "waterBearing"), ...run(160, 200, "clay"),
];

describe("suggestDrilling", () => {
  it("proposes slotted pipe in water-bearing stretches of 10 ft or more below the water level", () => {
    const s = suggestDrilling(COLUMN, water(50), [nb(200)])!;
    expect(s.proposal!.slotted).toEqual([
      { top: 50, bottom: 80, level: "likely" }, // cut at the water level
      { top: 120, bottom: 160, level: "rough" }, // the weaker level of its steps
    ]);
    expect(s.proposal!.waterFt).toBe(50);
    expect(s.noProposal).toBeNull();
  });

  it("drills to the bottom of the lowest stretch", () => {
    expect(suggestDrilling(COLUMN, water(50), [nb(200)])!.proposal!.drillToFt).toBe(160);
  });

  it("never deeper than the deepest borewell nearby", () => {
    expect(suggestDrilling(COLUMN, water(50), [nb(140), nb(120)])!.proposal!.drillToFt).toBe(140);
  });

  it("leaves out a stretch that is less than 10 ft once the part above the water is cut off", () => {
    const s = suggestDrilling([...run(0, 40, "clay"), ...run(40, 55, "waterBearing"), ...run(55, 100, "clay")], water(50), [nb(100)])!;
    expect(s.proposal).toBeNull();
    expect(s.noProposal).toBe("noWaterBearing");
  });

  it("proposes nothing where the model would not show anything", () => {
    const s = suggestDrilling([...run(0, 50, "clay"), ...run(50, 100, null)], water(20), [nb(100)])!;
    expect(s.noProposal).toBe("noWaterBearing");
  });

  it("says so, and shows only what was done nearby, without a water level", () => {
    const s = suggestDrilling(COLUMN, null, [nb(200, 110)])!;
    expect(s.proposal).toBeNull();
    expect(s.noProposal).toBe("noWater");
    expect(s.nearby).toHaveLength(1);
  });

  it("gives the spread of depths and pump positions nearby, leaving out what nobody recorded", () => {
    const s = suggestDrilling(COLUMN, water(50), [nb(200, 100), nb(300, null), nb(250, 120)])!;
    expect(s.drilled).toEqual({ low: 200, middle: 250, high: 300 });
    expect(s.pump).toEqual({ low: 100, middle: 110, high: 120 });
    expect(suggestDrilling(COLUMN, water(50), [nb(null, null)])!).toMatchObject({ drilled: null, pump: null });
  });

  it("has no suggestion with nobody nearby", () => {
    expect(suggestDrilling(COLUMN, water(50), [])).toBeNull();
  });
});
