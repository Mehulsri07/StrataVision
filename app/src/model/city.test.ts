/**
 * The model on a made-up city of 500 borewells whose true ground is known: is it right where it
 * says it is sure, does it improve with more borewells, and is it fast enough for the screens?
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_MATERIALS, METRES_TO_FEET, heightAt } from "@strata/core";
import { checkModel, share } from "./check";
import { madeUpCity, truth } from "./madeUpCity";
import { GROUPS, type Group } from "./groups";
import { predictColumn, prepare, type Prepared } from "./model";
import { sectionAlong } from "./section";

const city = (count: number) => {
  const { sites, grid } = madeUpCity(count);
  return { sites, grid, prepared: prepare(sites, DEFAULT_MATERIALS, grid) };
};
const { sites, grid, prepared } = city(500);
const result = checkModel(prepared, grid);

/**
 * How often you would be right knowing only the height above sea level and nothing about the
 * place: at each height, guess whatever is commonest there across the whole city.
 */
function guessingByHeightAlone(all: Prepared[]) {
  const steps: { band: number; group: Group }[] = [];
  for (const p of all) for (const run of p.runs) for (let h = run.topFt - 2.5; h > run.bottomFt; h -= 5) steps.push({ band: Math.floor(h / 5), group: run.group });
  const seen = new Map<number, Record<Group, number>>();
  for (const { band, group } of steps) {
    const counts = seen.get(band) ?? { clay: 0, fineSand: 0, waterBearing: 0, hard: 0 };
    counts[group]++;
    seen.set(band, counts);
  }
  const commonest = (band: number) => GROUPS.reduce((a, b) => (seen.get(band)![b] > seen.get(band)![a] ? b : a));
  return steps.filter((s) => commonest(s.band) === s.group).length / steps.length;
}

/** GitHub's shared runners can be a few times slower than a desk computer. */
const SLOW = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI ? 3 : 1;

/** Milliseconds taken by `work`. */
const timed = (work: () => void) => {
  const start = performance.now();
  work();
  return performance.now() - start;
};

describe("a made-up city of 500 borewells", () => {
  it("has many borewells at the same spots, like the real records", () => {
    expect(prepared).toHaveLength(500);
    const sharing = prepared.filter((p) => prepared.some((q) => q !== p && Math.hypot((p.latitude - q.latitude) * 110.57, (p.longitude - q.longitude) * 99.3) <= 0.1));
    expect(sharing.length).toBeGreaterThan(150);
    expect(result.canJudge).toBe(true);
  });

  it("is ground where the place matters, and the model uses the place", () => {
    const blind = guessingByHeightAlone(prepared);
    console.log("made-up city, right by height alone:", blind);
    expect(blind).toBeLessThan(0.75);
    expect(share(result.overall)!).toBeGreaterThan(blind + 0.15);
  });

  it("finds logs typed in upside down, and few honest ones", () => {
    const { sites, grid: g, planted } = madeUpCity(500, 1, 10);
    const odd = checkModel(prepare(sites, DEFAULT_MATERIALS, g), g).oddOnesOut.map((o) => o.id);
    const found = planted.filter((id) => odd.includes(id));
    console.log("made-up city, upside-down logs found:", found.length, "of", planted.length, "honest flagged:", odd.length - found.length);
    expect(planted).toHaveLength(50);
    expect(found.length).toBeGreaterThanOrEqual(35); // most of them
    expect(odd.length - found.length).toBeLessThanOrEqual(10);
  });

  it("is right at least 7 times in 10 where it says likely", () => {
    console.log("made-up city, share right:", {
      overall: share(result.overall), likely: share(result.likely), rough: share(result.rough), none: share(result.none),
      under1: share(result.byDistance.under1), from1to3: share(result.byDistance.from1to3), over3: share(result.byDistance.over3),
      likelySteps: result.likely.steps, allSteps: result.overall.steps, odd: result.oddOnesOut.length,
    });
    expect(share(result.likely)!).toBeGreaterThanOrEqual(0.7);
    expect(share(result.likely)!).toBeGreaterThan(share(result.rough)!);
    // "Likely" must not be bought by hardly ever saying it.
    expect(result.likely.steps).toBeGreaterThan(result.overall.steps * 0.5);
  });

  it("flags few honest borewells as odd", () => {
    expect(result.oddOnesOut.length).toBeLessThanOrEqual(10);
  });

  it("gets better with more borewells", () => {
    const small = city(100);
    expect(share(checkModel(small.prepared, small.grid).overall)!).toBeLessThan(share(result.overall)!);
  });

  it("agrees with the truth at a place nobody drilled", () => {
    const [latitude, longitude] = [26.87, 80.97];
    const groundFt = heightAt(grid, latitude, longitude)! * METRES_TO_FEET;
    const sure = predictColumn(latitude, longitude, prepared, grid)!.filter((s) => s.confidence === "likely");
    expect(sure.length).toBeGreaterThan(20);
    const right = sure.filter((s) => s.likely === truth(latitude, longitude, groundFt - (s.top + s.bottom) / 2));
    expect(right.length / sure.length).toBeGreaterThanOrEqual(0.7);
  });

  it("is fast enough", { timeout: 30_000 }, () => {
    const times = {
      column: timed(() => predictColumn(26.87, 80.97, prepared, grid)),
      // A section: 200 columns along a line across the city, with the borewells near it and the water.
      section: timed(() => sectionAlong([[26.76, 80.86], [26.94, 81.04]], 0.5, prepared, grid, sites.map((s) => s.borewell))),
      // A city map: 100 × 100 points.
      map: timed(() => { for (let i = 0; i < 100; i++) for (let j = 0; j < 100; j++) predictColumn(26.75 + i * 0.002, 80.85 + j * 0.002, prepared, grid); }),
      check: timed(() => checkModel(prepared, grid)),
    };
    console.log("made-up city, milliseconds:", times);
    expect(times.column).toBeLessThan(20 * SLOW);
    expect(times.section).toBeLessThan(1000 * SLOW);
    expect(times.map).toBeLessThan(5000 * SLOW);
    expect(times.check).toBeLessThan(5000 * SLOW);
  });
});
