import { describe, expect, it } from "vitest";
import type { Borewell } from "@strata/core";
import type { Group } from "./groups";
import type { Step } from "./model";
import { CENTRE, east, north } from "./testGround";
import { blocks, distanceInWords, howOften, sharesInWords, summary, waterHere } from "./words";

const shares = (clay: number, fineSand: number, waterBearing: number, hard: number) => ({ clay, fineSand, waterBearing, hard });

describe("sharesInWords", () => {
  it.each([
    [shares(1, 0, 0, 0), "Clay"],
    [shares(0.92, 0.08, 0, 0), "Clay"],
    [shares(0.25, 0.05, 0.7, 0), "Mostly water-bearing sand, some clay"],
    [shares(0.15, 0.15, 0.7, 0), "Mostly water-bearing sand, some clay, some fine sand"],
    [shares(0.5, 0, 0.5, 0), "Clay or water-bearing sand"],
    [shares(0.3, 0.1, 0.2, 0.4), "Hard ground or clay"],
  ])("%o → %s", (s, words) => expect(sharesInWords(s)).toBe(words));
});

describe("distanceInWords", () => {
  it.each([[0.337, "340 m"], [0.004, "0 m"], [0.994, "990 m"], [0.999, "1.0 km"], [1.24, "1.2 km"], [12.06, "12.1 km"]])(
    "%f km → %s", (km, words) => expect(distanceInWords(km)).toBe(words));
});

describe("howOften", () => {
  it.each([
    [1, "almost always"], [0.97, "almost always"], [0.88, "about 9 times in 10"], [0.8, "about 4 times in 5"],
    [0.74, "about 3 times in 4"], [0.66, "about 2 times in 3"], [0.5, "about half the time"],
    [0.34, "about 1 time in 3"], [0.28, "about 1 time in 4"], [0.1, "rarely"], [0, "rarely"],
  ])("%f → %s", (share, words) => expect(howOften(share)).toBe(words));
});

describe("blocks", () => {
  const step = (top: number, likely: Group | null, confidence: Step["confidence"]): Step =>
    ({ top, bottom: top + 5, shares: likely ? { ...shares(0, 0, 0, 0), [likely]: 1 } : null, likely, confidence, sources: [] });

  it("joins neighbouring steps of the same group and level", () => {
    const got = blocks([step(0, "clay", "likely"), step(5, "clay", "likely"), step(10, "clay", "rough"), step(15, null, "none")]);
    expect(got.map(({ top, bottom, group, level, steps }) => [top, bottom, group, level, steps.length])).toEqual([
      [0, 10, "clay", "likely", 2], [10, 15, "clay", "rough", 1], [15, 20, null, "none", 1],
    ]);
  });

  it("a step the model would not show has no group, even if somebody voted", () => {
    const voted: Step = { top: 0, bottom: 5, shares: shares(1, 0, 0, 0), likely: null, confidence: "none", sources: [] };
    expect(blocks([voted, step(5, null, "none")])).toMatchObject([{ top: 0, bottom: 10, group: null, level: "none" }]);
  });

  it("an empty column has no blocks", () => expect(blocks([])).toEqual([]));
});

describe("waterHere", () => {
  const well = (km: number, waterLevel: number | null, waterLevelOn: string | null) =>
    ({ latitude: north(0), longitude: east(km), waterLevel, waterLevelOn }) as Borewell;
  const here = (borewells: Borewell[]) => waterHere(CENTRE[0], CENTRE[1], borewells);

  it("estimates from a recent reading nearby, and says since when and how near", () => {
    const got = here([well(0.5, 60, "2026-03-01")])!;
    expect(got.feet).toBe(60);
    expect(got.nearestKm).toBeCloseTo(0.5, 2);
    expect(got.since).toBe("2023");
  });

  it("leans towards the nearer reading", () => {
    const got = here([well(0.3, 60, "2026-03-01"), well(-0.9, 100, "2026-01-01")])!;
    expect(got.feet).toBeGreaterThan(60);
    expect(got.feet).toBeLessThan(65);
  });

  it("says nothing when the nearest recent reading is more than 1 km away", () => {
    expect(here([well(1.2, 60, "2026-03-01")])).toBeNull();
  });

  it("says nothing with no water levels at all", () => {
    expect(here([well(0.5, null, null)])).toBeNull();
    expect(here([])).toBeNull();
  });

  it("does not mix old readings with recent ones", () => {
    const got = here([well(0.2, 20, "2015-06-01"), well(0.5, 60, "2026-03-01")])!;
    expect(got.feet).toBe(60);
  });

  it("does not use a reading with no date: nobody can say it is recent", () => {
    const got = here([well(0.2, 20, null), well(0.5, 60, "2026-03-01")])!;
    expect(got.feet).toBe(60);
    expect(here([well(0.2, 20, null)])).toBeNull();
  });

  it("ignores readings beyond 1 km even when a nearer one exists", () => {
    const got = here([well(0.5, 60, "2026-03-01"), well(1.5, 500, "2026-03-01")])!;
    expect(got.feet).toBe(60);
  });
});

describe("summary of a stretch", () => {
  const source = (id: string, km: number) => ({ id, borewellId: id.toUpperCase(), km, weight: 1 });
  const step = (top: number, clay: number, sources: ReturnType<typeof source>[]): Step =>
    ({ top, bottom: top + 5, shares: shares(clay, 0, 1 - clay, 0), likely: "clay", confidence: "likely", sources });

  it("averages what the steps say, so a mixed lower part is not lost", () => {
    const [block] = blocks([step(0, 1, [source("a", 0.2)]), step(5, 1, [source("a", 0.2)]), step(10, 0.6, [source("a", 0.2), source("b", 0.5)]), step(15, 0.6, [source("b", 0.5)])]);
    const got = summary(block);
    expect(got.shares!.clay).toBeCloseTo(0.8, 6);
    expect(got.shares!.waterBearing).toBeCloseTo(0.2, 6);
    expect(sharesInWords(got.shares!)).toBe("Mostly clay, some water-bearing sand");
  });

  it("lists every borewell behind the stretch once, nearest first", () => {
    const [block] = blocks([step(0, 1, [source("far", 0.9), source("near", 0.2)]), step(5, 1, [source("near", 0.2), source("mid", 0.5)])]);
    expect(summary(block).sources.map((s) => s.id)).toEqual(["near", "mid", "far"]);
  });

  it("proposes nothing, and names nobody, where there is not enough data", () => {
    const lonely: Step = { top: 0, bottom: 5, shares: shares(1, 0, 0, 0), likely: null, confidence: "none", sources: [source("a", 4)] };
    expect(summary(blocks([lonely])[0])).toEqual({ shares: null, sources: [] });
  });
});
