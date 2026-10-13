/**
 * The model on a made-up city of 500 borewells whose true ground is known: is it right where it
 * says it is sure, does it improve with more borewells, and is it fast enough for the screens?
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_MATERIALS, METRES_TO_FEET, heightAt } from "@strata/core";
import { checkModel, share } from "./check";
import { madeUpCity, truth } from "./madeUpCity";
import { predictColumn, prepare } from "./model";

const city = (count: number) => {
  const { sites, grid } = madeUpCity(count);
  return { grid, prepared: prepare(sites, DEFAULT_MATERIALS, grid) };
};
const { grid, prepared } = city(500);
const result = checkModel(prepared, grid);

/** Milliseconds taken by `work`. */
const timed = (work: () => void) => {
  const start = performance.now();
  work();
  return performance.now() - start;
};

describe("a made-up city of 500 borewells", () => {
  it("has many borewells at the same spots, like the real records", () => {
    expect(prepared).toHaveLength(500);
    expect(result.compared).toBe(500);
    expect(result.canJudge).toBe(true);
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
      // A section: 200 columns along a line across the city.
      section: timed(() => { for (let i = 0; i < 200; i++) predictColumn(26.76 + i * 0.0009, 80.86 + i * 0.0009, prepared, grid); }),
      // A city map: 100 × 100 points.
      map: timed(() => { for (let i = 0; i < 100; i++) for (let j = 0; j < 100; j++) predictColumn(26.75 + i * 0.002, 80.85 + j * 0.002, prepared, grid); }),
      check: timed(() => checkModel(prepared, grid)),
    };
    console.log("made-up city, milliseconds:", times);
    expect(times.column).toBeLessThan(20);
    expect(times.section).toBeLessThan(1000);
    expect(times.map).toBeLessThan(5000);
    expect(times.check).toBeLessThan(5000);
  });
});
