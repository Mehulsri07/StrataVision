import { describe, expect, it } from "vitest";
import { DEFAULT_MATERIALS } from "@strata/core";
import { prepare, type ModelSite } from "./model";
import { offsetPath, sliceAlong } from "./slice";
import { CENTRE, east, flatGrid, north, site } from "./testGround";

const flat = flatGrid(120);
const CLAY: [number, number, string][] = [[0, 200, "clay"]];
const slice = (path: [number, number][], sites: ModelSite[], depthKm = 1) =>
  sliceAlong(path, 0.5, depthKm, prepare(sites, DEFAULT_MATERIALS, flat), flat, sites.map((s) => s.borewell));
const close = (xy: number[]) => xy.map((v) => expect.closeTo(v, 2));

describe("offsetPath", () => {
  it("moves a straight line to its left", () => {
    expect(offsetPath([[0, 0], [2, 0]], 1)).toEqual([[0, 1], [2, 1]].map(close));
  });

  it("mitres the corner of a bend", () => {
    // East, then north: the left side is north, then west; the corner moves in to (1, 1).
    expect(offsetPath([[0, 0], [2, 0], [2, 2]], 1)).toEqual([[0, 1], [1, 1], [1, 2]].map(close));
  });

  it("caps the corner of a sharp turn", () => {
    const [, corner] = offsetPath([[0, 0], [2, 0], [0, 0.1]], 1);
    expect(Math.hypot(corner[0] - 2, corner[1])).toBeLessThanOrEqual(3 + 1e-9);
  });
});

describe("sliceAlong", () => {
  it("has a front and a back for each straight part, and two ends", () => {
    const s = slice([CENTRE, [north(0), east(2)], [north(2), east(2)]], [])!;
    expect(s.faces.map((f) => f.kind)).toEqual(["front", "front", "back", "back", "end", "end"]);
  });

  it("draws the back from A′ to A, so it reads the right way from behind", () => {
    const s = slice([CENTRE, [north(0), east(2)]], [])!;
    const back = s.faces.find((f) => f.kind === "back")!;
    expect(back.from).toEqual(close([2, 1]));
    expect(back.to).toEqual(close([0, 1]));
    const [endA, endB] = s.faces.filter((f) => f.kind === "end");
    expect([endA.from, endA.to]).toEqual([close([0, 1]), close([0, 0])]);
    expect([endB.from, endB.to]).toEqual([close([2, 0]), close([2, 1])]);
    expect(s.top).toEqual([[0, 0], [2, 0], [2, 1], [0, 1]].map(close));
  });

  it("pins the borewells inside the strip behind the line, and no others", () => {
    const sites = [site("in", north(0.5), east(1), CLAY), site("front", north(-0.3), east(1), CLAY), site("beyond", north(1.5), east(1), CLAY)];
    const s = slice([CENTRE, [north(0), east(2)]], sites)!;
    expect(s.pins.map((p) => p.id)).toEqual(["in"]);
    expect(s.pins[0].at).toEqual(close([1, 0.5]));
  });

  it("draws every side to one height range", () => {
    const s = slice([CENTRE, [north(0), east(2)]], [site("a", north(0.5), east(1), CLAY)])!;
    expect(s.highFt).toBeGreaterThan(s.lowFt);
    expect(s.lowFt).toBeLessThanOrEqual(120 * 3.28084 - 200 + 1e-6);
  });

  it("is null without a line", () => {
    expect(slice([CENTRE], [])).toBeNull();
  });
});
