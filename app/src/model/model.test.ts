import { describe, expect, it } from "vitest";
import { DEFAULT_MATERIALS, type ElevationGrid } from "@strata/core";
import { predictColumn, prepare, type ModelSite, type Step } from "./model";
import { CENTRE, east, flatGrid, north, site, slopeGrid } from "./testGround";

const flat = flatGrid(120);
const CLAY_OVER_SAND: [number, number, string][] = [[0, 50, "clay"], [50, 100, "medium_sand"]];
const CLAY: [number, number, string][] = [[0, 200, "clay"]];
const SAND: [number, number, string][] = [[0, 200, "medium_sand"]];

/** The column at the centre, from these borewells. */
const column = (sites: ModelSite[], grid: ElevationGrid = flat) => {
  const col = predictColumn(CENTRE[0], CENTRE[1], prepare(sites, DEFAULT_MATERIALS, grid), grid);
  if (!col) throw new Error("no column");
  return col;
};
const stepAt = (col: Step[], depthFt: number) => {
  const step = col.find((s) => s.top <= depthFt && depthFt < s.bottom);
  if (!step) throw new Error(`no step at ${depthFt} ft`);
  return step;
};
/** Three borewells with the same layers, `km` from the centre to the north, east and south-west. */
const around = (km: number, layers: [number, number, string][], name = "a") => [
  site(`${name}1`, north(km), east(0), layers),
  site(`${name}2`, north(0), east(km), layers),
  site(`${name}3`, north(-km * 0.7), east(-km * 0.7), layers),
];
/** `count` borewells within 30 m of each other, `km` east of the centre. */
const crowd = (count: number, km: number, layers: [number, number, string][]) =>
  Array.from({ length: count }, (_, i) => site(`c${i}`, north(i * 0.002), east(km), layers));

describe("predictColumn", () => {
  it("recovers a flat layer between borewells", () => {
    const col = column(around(0.5, CLAY_OVER_SAND));
    expect(col).toHaveLength(20);
    expect(stepAt(col, 20)).toMatchObject({ top: 20, bottom: 25, likely: "clay", confidence: "likely" });
    expect(stepAt(col, 70)).toMatchObject({ likely: "waterBearing", confidence: "likely" });
    expect(stepAt(col, 20).shares).toEqual({ clay: 1, fineSand: 0, waterBearing: 0, hard: 0 });
  });

  it("names the borewells behind a step, nearest first", () => {
    const col = column([site("far", north(-0.8), east(0), CLAY), site("near", north(0.3), east(0), CLAY), site("mid", north(0), east(0.5), CLAY)]);
    const { sources } = stepAt(col, 20);
    expect(sources.map((s) => s.id)).toEqual(["near", "mid", "far"]);
    expect(sources[0].borewellId).toBe("NEAR");
    expect(sources[0].km).toBeCloseTo(0.3, 2);
    expect(sources[0].weight).toBeGreaterThan(sources[1].weight);
  });

  it("stops a shallow borewell voting below its bottom", () => {
    const col = column([site("deep1", north(0.5), east(0), CLAY), site("deep2", north(0), east(0.5), CLAY), site("shallow", north(-0.1), east(0), [[0, 50, "medium_sand"]])]);
    expect(stepAt(col, 20).likely).toBe("waterBearing");
    expect(stepAt(col, 120).shares?.clay).toBe(1);
    expect(stepAt(col, 120).sources.map((s) => s.id).sort()).toEqual(["deep1", "deep2"]); // equally far, either order
  });

  it("a crowded site shares one vote", () => {
    const col = column([...crowd(10, 1, CLAY), site("alone", north(0), east(-1), SAND)]);
    expect(stepAt(col, 20).shares?.clay).toBeCloseTo(0.5, 1);
  });

  it("a crowded site is one site for confidence", () => {
    const step = stepAt(column(crowd(10, 0.5, CLAY)), 20);
    expect(step.shares?.clay).toBe(1);
    expect(step).toMatchObject({ confidence: "none", likely: null });
  });

  it("ponytail limit: more than 12 borewells at the nearest spot leave room for nobody else", () => {
    // Today's behaviour, written down so that changing it is a decision: the voters are the 12
    // nearest borewells, not sites.
    const step = stepAt(column([...crowd(13, 0.2, CLAY), site("other", north(0), east(-0.5), SAND)]), 20);
    expect(step.sources).toHaveLength(12);
    expect(step.shares?.waterBearing).toBe(0);
    expect(step.confidence).toBe("none");
  });

  it("matches layers by height, not depth, on sloping ground", () => {
    // The ground climbs about 8 ft per km eastwards. Sand lies between 250 and 300 ft above sea
    // level everywhere, so it is deeper below ground in the east than in the west.
    const slope = slopeGrid(60, 180);
    const groundFt = (lon: number) => (60 + ((lon - 80.7) / 0.5) * 120) * 3.28084;
    const logged = (id: string, lon: number) => {
      const top = groundFt(lon) - 300, bottom = groundFt(lon) - 250;
      return site(id, north(0), lon, [[0, top, "clay"], [top, bottom, "medium_sand"], [bottom, 200, "clay"]]);
    };
    const col = column([logged("west", east(-2)), logged("east", east(2))], slope);
    // At the centre the sand is 93.7 to 143.7 ft down. The west borewell has sand at 87 ft and the
    // east one has clay at 142 ft: matching by depth would mix them.
    expect(stepAt(col, 87).shares?.clay).toBeCloseTo(1, 6);
    expect(stepAt(col, 97).shares?.waterBearing).toBeCloseTo(1, 6);
    expect(stepAt(col, 142).shares?.waterBearing).toBeCloseTo(1, 6);
    expect(stepAt(col, 147).shares?.clay).toBeCloseTo(1, 6);
    expect(stepAt(col, 97).confidence).toBe("rough");
  });

  it("uses a borewell's own recorded ground height before the grid", () => {
    // Surveyed 10 m above what the grid says, so its sand starts 16.9 ft down at the centre, not 50.
    const col = column([site("surveyed", north(0), east(0.5), CLAY_OVER_SAND, { groundElevationM: 130 })]);
    expect(stepAt(col, 12).shares?.clay).toBe(1);
    expect(stepAt(col, 22).shares?.waterBearing).toBe(1);
    expect(col).toHaveLength(14);
  });

  it("confidence falls with distance", () => {
    expect(stepAt(column(around(0.5, CLAY)), 20).confidence).toBe("likely");
    expect(stepAt(column(around(2, CLAY)), 20).confidence).toBe("rough");
    expect(stepAt(column(around(4, CLAY)), 20)).toMatchObject({ confidence: "none", likely: null });
  });

  it("confidence falls with disagreement", () => {
    const step = stepAt(column([site("a", north(0.5), east(0), CLAY), site("b", north(0), east(0.5), SAND), site("c", north(-3), east(0), CLAY)]), 20);
    expect(step).toMatchObject({ confidence: "rough", likely: "clay" });
    expect(step.shares!.clay).toBeLessThan(0.6);
  });

  it("gives a tie to the earlier group", () => {
    const step = stepAt(column([site("a", north(0.5), east(0), SAND), site("b", north(-0.5), east(0), CLAY)]), 20);
    expect(step.likely).toBe("clay");
  });

  it("counts poor records and address-located borewells less", () => {
    const against = (overrides: Parameters<typeof site>[4]) =>
      stepAt(column([site("good", north(0), east(1), CLAY), site("weak", north(0), east(-1), SAND, overrides)]), 20).shares!.clay;
    expect(against({ recordQuality: "poor" })).toBeCloseTo(1 / 1.4, 3);
    expect(against({ recordQuality: "fair" })).toBeCloseTo(1 / 1.7, 3);
    expect(against({ locationSource: "address" })).toBeCloseTo(1 / 1.5, 3);
  });

  it("converts borewells logged in metres", () => {
    const col = column([site("metric", north(0), east(0.5), [[0, 10, "clay"]], { depthUnit: "m" })]);
    expect(col).toHaveLength(7); // 10 m is 32.8 ft
    expect(stepAt(col, 27).shares?.clay).toBe(1);
  });

  it("not recorded and gaps never vote", () => {
    const col = column([site("patchy", north(0), east(0.5), [[0, 50, "not_recorded"], [60, 100, "clay"]])]);
    expect(col).toHaveLength(20);
    for (const depth of [20, 52]) expect(stepAt(col, depth)).toMatchObject({ shares: null, likely: null, confidence: "none", sources: [] });
    expect(stepAt(col, 70).shares?.clay).toBe(1);
  });

  it("the driller's tick makes fine sand water-bearing", () => {
    const col = column([site("ticked", north(0), east(0.5), [[0, 50, "fine_sand", true], [50, 100, "fine_sand"]])]);
    expect(stepAt(col, 20).shares?.waterBearing).toBe(1);
    expect(stepAt(col, 70).shares?.fineSand).toBe(1);
  });

  it("gives no answer outside the ground-height grid", () => {
    expect(predictColumn(28, 80.95, prepare(around(0.5, CLAY), DEFAULT_MATERIALS, flat), flat)).toBeNull();
  });

  it("gives an empty column with no borewell within 5 km", () => {
    expect(column([site("far", north(6), east(0), CLAY)])).toEqual([]);
  });

  it("exclude hides a borewell from its own prediction", () => {
    const prepared = prepare([site("here", CENTRE[0], CENTRE[1], CLAY)], DEFAULT_MATERIALS, flat);
    expect(predictColumn(CENTRE[0], CENTRE[1], prepared, flat)).toHaveLength(40);
    expect(predictColumn(CENTRE[0], CENTRE[1], prepared, flat, { exclude: "here" })).toEqual([]);
  });

  it("groundM stands in for the grid at the asked point", () => {
    const prepared = prepare([site("a", north(0), east(0.5), CLAY_OVER_SAND)], DEFAULT_MATERIALS, flat);
    // Standing 10 m higher than the grid says, the sand is 32.8 ft further down.
    const col = predictColumn(CENTRE[0], CENTRE[1], prepared, flat, { groundM: 130 })!;
    expect(stepAt(col, 77).shares?.clay).toBe(1);
    expect(stepAt(col, 87).shares?.waterBearing).toBe(1);
  });
});

describe("prepare", () => {
  it("leaves out borewells it cannot place", () => {
    const prepared = prepare([
      site("ok", north(0), east(0), CLAY),
      site("surveyed-outside", 28, 80.95, CLAY, { groundElevationM: 125 }),
      site("no-location", null, null, CLAY),
      site("outside-grid", 28, 80.95, CLAY),
      site("nothing-recorded", north(1), east(0), [[0, 100, "not_recorded"]]),
      site("unlinked", north(2), east(0), [[0, 100, null]]),
    ], DEFAULT_MATERIALS, flat);
    expect(prepared.map((p) => p.id)).toEqual(["ok", "surveyed-outside"]);
  });

  it("turns depths into heights above sea level, in feet", () => {
    const [p] = prepare([site("a", north(0), east(0), CLAY_OVER_SAND)], DEFAULT_MATERIALS, flat);
    expect(p.groundFt).toBeCloseTo(393.7, 1);
    expect(p.runs).toHaveLength(2);
    expect(p.runs[1]).toMatchObject({ group: "waterBearing" });
    expect(p.runs[1].topFt).toBeCloseTo(343.7, 1);
    expect(p.runs[1].bottomFt).toBeCloseTo(293.7, 1);
    expect(p.weight).toBe(1);
  });
});
