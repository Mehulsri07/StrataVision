import { describe, expect, it } from "vitest";
import { DEFAULT_MATERIALS } from "@strata/core";
import { checkModel, share } from "./check";
import { prepare, type ModelSite } from "./model";
import { east, flatGrid, north, site } from "./testGround";

const flat = flatGrid(120);
const CLAY_OVER_SAND: [number, number, string][] = [[0, 50, "clay"], [50, 100, "medium_sand"]];
const SAND_OVER_CLAY: [number, number, string][] = [[0, 50, "medium_sand"], [50, 100, "clay"]];

/** `side` × `side` borewells `km` apart, all with the same layers. */
const town = (side: number, km: number, layers = CLAY_OVER_SAND): ModelSite[] =>
  Array.from({ length: side * side }, (_, i) => site(`t${i}`, north(Math.floor(i / side) * km), east((i % side) * km), layers));
const check = (sites: ModelSite[]) => checkModel(prepare(sites, DEFAULT_MATERIALS, flat), flat);

describe("checkModel", () => {
  it("scores a uniform town as always right", () => {
    const r = check(town(4, 0.5));
    expect(r.canJudge).toBe(true);
    expect(r.compared).toBe(16);
    expect(r.overall).toEqual({ steps: 320, right: 320, borewells: 16 });
    expect(r.likely).toEqual(r.overall);
    expect(r.byDistance.under1).toEqual(r.overall);
    expect(r.oddOnesOut).toEqual([]);
  });

  it("finds a borewell that does not fit its surroundings", () => {
    const sites = town(4, 0.5);
    sites[5] = site("upside-down", sites[5].borewell.latitude, sites[5].borewell.longitude, SAND_OVER_CLAY);
    const r = check(sites);
    expect(r.oddOnesOut).toHaveLength(1);
    expect(r.oddOnesOut[0]).toMatchObject({ id: "upside-down", borewellId: "UPSIDE-DOWN", steps: 20, right: 0, typical: 1 });
    expect(share(r.overall)).toBe(300 / 320);
  });

  it("lists the worst first", () => {
    const sites = town(5, 0.5);
    sites[6] = site("all-wrong", sites[6].borewell.latitude, sites[6].borewell.longitude, SAND_OVER_CLAY);
    // Right for the top 30 ft only: 6 steps of 20.
    sites[18] = site("mostly-wrong", sites[18].borewell.latitude, sites[18].borewell.longitude, [[0, 30, "clay"], [30, 50, "medium_sand"], [50, 100, "clay"]]);
    expect(check(sites).oddOnesOut.map((o) => o.id)).toEqual(["all-wrong", "mostly-wrong"]);
  });

  it("hides everything at the spot, so borewells side by side cannot vouch for each other", () => {
    const sites = town(4, 0.5);
    const b = sites[5].borewell;
    sites[5] = site("twin-a", b.latitude, b.longitude, SAND_OVER_CLAY);
    sites.push(site("twin-b", b.latitude! + 0.03 / 110.57, b.longitude, SAND_OVER_CLAY));
    expect(check(sites).oddOnesOut.map((o) => o.id).sort()).toEqual(["twin-a", "twin-b"]);
  });

  it("does not blame a borewell for what lies far below its neighbour", () => {
    // An honest borewell 4 km out of town in different ground, with a shallow one beside it.
    const far = east(1.5 + 4);
    const r = check([...town(4, 0.5), site("edge-deep", north(0), far, [[0, 30, "clay"], [30, 100, "kankar"]]), site("edge-shallow", north(0.03), far, [[0, 30, "clay"]])]);
    expect(r.oddOnesOut).toEqual([]);
    expect(r.byDistance.under1).toEqual({ steps: 320, right: 320, borewells: 16 });
    expect(r.byDistance.over3.steps).toBeGreaterThan(0);
    expect(r.byDistance.over3.right).toBeLessThan(r.byDistance.over3.steps);
  });

  it("cannot judge on fewer than ten borewells", () => {
    const sites = town(3, 0.5);
    sites[4] = site("upside-down", sites[4].borewell.latitude, sites[4].borewell.longitude, SAND_OVER_CLAY);
    const r = check(sites);
    expect(r.compared).toBe(9);
    expect(r.canJudge).toBe(false);
    expect(r.oddOnesOut).toEqual([]);
  });

  it("does not divide by zero when nothing is comparable", () => {
    // Twelve borewells, each more than 5 km from every other.
    const r = check(Array.from({ length: 12 }, (_, i) => site(`far${i}`, north((Math.floor(i / 4) - 1) * 6), east(((i % 4) - 1.5) * 6), CLAY_OVER_SAND)));
    expect(r.compared).toBe(0);
    expect(r.canJudge).toBe(false);
    expect(r.overall).toEqual({ steps: 0, right: 0, borewells: 0 });
    expect(share(r.overall)).toBeNull();
    expect(r.oddOnesOut).toEqual([]);
  });

  it("puts borewells in the band of their nearest neighbour, and scores guesses the model would not show", () => {
    // Three pairs, far from each other; the borewells of a pair are 0.5, 2 and 4 km apart.
    const pair = (name: string, y: number, gap: number) => [site(`${name}a`, north(y), east(-10), CLAY_OVER_SAND), site(`${name}b`, north(y), east(-10 + gap), CLAY_OVER_SAND)];
    const r = check([...pair("near", -12, 0.5), ...pair("mid", 0, 2), ...pair("far", 12, 4)]);
    const both = { steps: 40, right: 40, borewells: 2 };
    expect(r.byDistance).toEqual({ under1: both, from1to3: both, over3: both });
    // One borewell is one site, which the model never shows as an estimate; the check still scores it,
    // but keeps it out of the headline.
    expect(r.none).toEqual({ steps: 120, right: 120, borewells: 6 });
    expect(r.overall).toEqual({ steps: 0, right: 0, borewells: 0 });
  });

  it("compares by height, using the hidden borewell's own ground", () => {
    // Surveyed 10 m above its neighbours, and logged accordingly: the same layers by height.
    const sites = town(4, 0.5);
    const b = sites[5].borewell;
    sites[5] = site("on-a-mound", b.latitude, b.longitude, [[0, 82.8, "clay"], [82.8, 132.8, "medium_sand"]], { groundElevationM: 130 });
    const r = check(sites);
    expect(r.overall.steps).toBe(320);
    expect(r.overall.right).toBe(320);
  });
});
