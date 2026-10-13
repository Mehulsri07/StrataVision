/**
 * A made-up city whose true ground is known everywhere, for testing the model at the real size
 * (about 500 borewells, many of them at the same spots). Not used by the app.
 */
import { METRES_TO_FEET, heightAt, type ElevationGrid } from "@strata/core";
import type { Group } from "./groups";
import type { ModelSite } from "./model";
import { CENTRE, site, slopeGrid } from "./testGround";

const SOIL: Record<Group, string> = { clay: "clay", waterBearing: "medium_sand", fineSand: "fine_sand", hard: "kankar" };

/**
 * Going down: clay, water-bearing sand, fine sand, hard ground, then water-bearing sand again.
 * Each boundary sits at `base` feet above sea level and rises and falls by 40 ft across the city
 * as a smooth wave 8 km long, each running in its own direction. The waves are taller than the
 * layers are thick, so layers thin out and vanish in places, as sand lenses do: knowing the height
 * alone is not enough to guess the ground, the place matters.
 */
const BOUNDARIES = [
  { base: 330, direction: 0.3, shift: 0 },
  { base: 280, direction: 1.4, shift: 2 },
  { base: 250, direction: 2.5, shift: 4 },
  { base: 220, direction: 4.0, shift: 1 },
];
const BELOW: Group[] = ["clay", "waterBearing", "fineSand", "hard", "waterBearing"];

/** What the made-up ground really is at a place and a height above sea level, in feet. */
export function truth(latitude: number, longitude: number, heightFt: number): Group {
  const x = (longitude - CENTRE[1]) * 111.32 * Math.cos((CENTRE[0] * Math.PI) / 180), y = (latitude - CENTRE[0]) * 110.57;
  let ceiling = Infinity;
  for (let i = 0; i < BOUNDARIES.length; i++) {
    const { base, direction, shift } = BOUNDARIES[i];
    const wave = Math.sin((2 * Math.PI * (x * Math.cos(direction) + y * Math.sin(direction))) / 8 + shift);
    ceiling = Math.min(ceiling, base + 40 * wave); // a boundary never rises above the one over it
    if (heightFt > ceiling) return BELOW[i];
  }
  return BELOW[BOUNDARIES.length];
}

/** A small repeatable random-number function (mulberry32), so the city is the same on every run. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` borewells logged from `truth`: 70% spread over the city, 30% within 50 m of an earlier
 * one, each 150 to 400 ft deep. Always the same for the same seed.
 *
 * With `wrongEvery`, every so-many-th borewell is logged upside down (as if the log had been typed
 * in from the bottom); their ids are returned as `planted`.
 */
export function madeUpCity(count: number, seed = 1, wrongEvery = 0): { sites: ModelSite[]; grid: ElevationGrid; planted: string[] } {
  const grid = slopeGrid(110, 125);
  const next = random(seed);
  const sites: ModelSite[] = [];
  const planted: string[] = [];
  for (let i = 0; i < count; i++) {
    let latitude: number, longitude: number;
    if (i > 0 && next() < 0.3) {
      const beside = sites[Math.floor(next() * sites.length)].borewell;
      latitude = beside.latitude! + ((next() - 0.5) * 0.07) / 110.57;
      longitude = beside.longitude! + ((next() - 0.5) * 0.07) / 99.3;
    } else {
      latitude = 26.75 + next() * 0.2;
      longitude = 80.85 + next() * 0.2;
    }
    const groundFt = heightAt(grid, latitude, longitude)! * METRES_TO_FEET;
    const depth = 150 + Math.floor(next() * 51) * 5;
    const layers: [number, number, string][] = [];
    for (let top = 0; top < depth; top += 5) {
      const soil = SOIL[truth(latitude, longitude, groundFt - (top + 2.5))];
      const last = layers[layers.length - 1];
      if (last && last[2] === soil) last[1] = top + 5;
      else layers.push([top, top + 5, soil]);
    }
    if (wrongEvery && i % wrongEvery === wrongEvery - 1) {
      planted.push(`m${i}`);
      let top = 0;
      const upsideDown = layers.reverse().map(([from, to, soil]): [number, number, string] => [top, (top += to - from), soil]);
      sites.push(site(`m${i}`, latitude, longitude, upsideDown));
    } else {
      sites.push(site(`m${i}`, latitude, longitude, layers));
    }
  }
  return { sites, grid, planted };
}
