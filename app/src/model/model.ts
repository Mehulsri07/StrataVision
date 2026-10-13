/**
 * The model: at this point, at this depth, what is the ground probably made of, and how sure are we?
 *
 * A weighted vote of nearby borewells, depth by depth. Layers are compared by height above sea
 * level, not depth below ground: the layers were laid flat, the ground above them was not. Nothing
 * is stored; the answer is worked out from the records each time, so a new borewell simply joins
 * the vote. Every answer can name the borewells behind it.
 */
import { METRES_TO_FEET, heightAt, type Borewell, type ElevationGrid, type Material, type StrataLayer } from "@strata/core";
import { ADDRESS_WEIGHT, LIKELY, MAX_VOTERS, MIN_DISTANCE_KM, QUALITY_WEIGHT, RADIUS_KM, ROUGH, SAME_SITE_KM, STEP_FT } from "./constants";
import { GROUPS, groupOf, materialsById, type Group } from "./groups";

export interface ModelSite {
  borewell: Borewell;
  strata: StrataLayer[];
}

/** One borewell made ready to vote. Heights are feet above sea level. */
export interface Prepared {
  id: string;
  borewellId: string;
  latitude: number;
  longitude: number;
  groundFt: number;
  /** The lowest height any of its layers reaches. */
  bottomFt: number;
  /** How much its vote counts before distance: record quality × how its location was found. */
  weight: number;
  /** Its layers that can vote, top first. */
  runs: { topFt: number; bottomFt: number; group: Group }[];
}

export type Confidence = "likely" | "rough" | "none";

export interface Source {
  id: string;
  borewellId: string;
  km: number;
  weight: number;
}

export interface Step {
  /** Feet below ground at the asked point. */
  top: number;
  bottom: number;
  /** Each group's share of the vote, adding up to 1; null when no borewell reaches this step. */
  shares: Record<Group, number> | null;
  /** The group with the largest share; null when confidence is "none". */
  likely: Group | null;
  confidence: Confidence;
  /** The borewells that voted, nearest first. */
  sources: Source[];
}

/**
 * Turns borewells into voters, once per load. Left out: borewells with no location, with no known
 * ground height (none recorded and outside the grid), or with no layer that can vote.
 */
export function prepare(sites: ModelSite[], materials: Material[], grid: ElevationGrid): Prepared[] {
  const byId = materialsById(materials);
  const prepared: Prepared[] = [];
  for (const { borewell: b, strata } of sites) {
    if (b.latitude == null || b.longitude == null) continue;
    // A borewell's own recorded ground height is always preferred to the grid.
    const groundM = b.groundElevationM ?? heightAt(grid, b.latitude, b.longitude);
    if (groundM == null) continue;
    const groundFt = groundM * METRES_TO_FEET;
    const toFeet = b.depthUnit === "m" ? METRES_TO_FEET : 1;
    const runs: Prepared["runs"] = [];
    for (const layer of [...strata].sort((x, y) => x.startDepth - y.startDepth)) {
      const group = groupOf(layer, byId);
      if (group && layer.endDepth > layer.startDepth) {
        runs.push({ topFt: groundFt - layer.startDepth * toFeet, bottomFt: groundFt - layer.endDepth * toFeet, group });
      }
    }
    if (runs.length === 0) continue;
    prepared.push({
      id: b.id, borewellId: b.borewellId, latitude: b.latitude, longitude: b.longitude, groundFt, runs,
      bottomFt: Math.min(...runs.map((r) => r.bottomFt)),
      weight: (QUALITY_WEIGHT[b.recordQuality] ?? QUALITY_WEIGHT.unknown) * (b.locationSource === "address" ? ADDRESS_WEIGHT : 1),
    });
  }
  return prepared;
}

/** What this borewell recorded at a height, or null in a gap, above its top or below its bottom. */
export function groupAt(p: Prepared, heightFt: number): Group | null {
  for (const run of p.runs) if (run.topFt >= heightFt && heightFt > run.bottomFt) return run.group;
  return null;
}

/**
 * The ground at a point, in steps from the surface down to the deepest that any borewell within
 * reach goes. Returns null when the ground height at the point is unknown, and an empty column when
 * no borewell is within reach. `exclude` (a borewell's id) and `groundM` are for the accuracy check.
 */
export function predictColumn(
  latitude: number, longitude: number, prepared: Prepared[], grid: ElevationGrid,
  options: { exclude?: string; groundM?: number } = {},
): Step[] | null {
  const groundM = options.groundM ?? heightAt(grid, latitude, longitude);
  if (groundM == null) return null;
  const groundFt = groundM * METRES_TO_FEET;

  // Positions in km east and north of the point: flat-earth, accurate to well under 1% across a city.
  const kx = 111.32 * Math.cos((latitude * Math.PI) / 180);
  const near: { p: Prepared; x: number; y: number; km: number }[] = [];
  for (const p of prepared) {
    if (p.id === options.exclude) continue;
    const x = (p.longitude - longitude) * kx, y = (p.latitude - latitude) * 110.57, km = Math.hypot(x, y);
    if (km <= RADIUS_KM) near.push({ p, x, y, km });
  }
  near.sort((a, b) => a.km - b.km);

  const deepestFt = Math.max(0, ...near.map((c) => groundFt - c.p.bottomFt));
  const column: Step[] = [];
  for (let top = 0; top < deepestFt; top += STEP_FT) {
    const middle = groundFt - (top + STEP_FT / 2);
    // ponytail: the 12 nearest borewells, not sites; a spot with 12 or more logs crowds out everyone else. Limit by site if real records show it.
    const voters: { c: (typeof near)[number]; group: Group }[] = [];
    for (const c of near) {
      const group = groupAt(c.p, middle);
      if (group && voters.push({ c, group }) === MAX_VOTERS) break;
    }
    column.push({ top, bottom: top + STEP_FT, ...vote(voters) });
  }
  return column;
}

/** The group with the largest share; a tie goes to the earlier group. */
export const largest = (shares: Record<Group, number>) => GROUPS.reduce((a, b) => (shares[b] > shares[a] ? b : a));

const apart = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function vote(voters: { c: { p: Prepared; x: number; y: number; km: number }; group: Group }[]): Pick<Step, "shares" | "likely" | "confidence" | "sources"> {
  if (voters.length === 0) return { shares: null, likely: null, confidence: "none", sources: [] };

  const shares: Record<Group, number> = { clay: 0, fineSand: 0, waterBearing: 0, hard: 0 };
  const sources: Source[] = [];
  let total = 0;
  for (const { c, group } of voters) {
    // Crowded sites don't shout: borewells close together share their vote.
    const crowd = voters.filter((other) => apart(other.c, c) <= SAME_SITE_KM).length;
    const weight = c.p.weight / Math.max(c.km, MIN_DISTANCE_KM) ** 2 / crowd;
    shares[group] += weight;
    total += weight;
    sources.push({ id: c.p.id, borewellId: c.p.borewellId, km: c.km, weight });
  }
  for (const g of GROUPS) shares[g] /= total;

  // Separate sites, nearest first: a voter starts a new one unless it is beside an earlier site.
  const sites: (typeof voters)[number]["c"][] = [];
  for (const { c } of voters) if (!sites.some((s) => apart(s, c) <= SAME_SITE_KM)) sites.push(c);

  const best = largest(shares);
  const nearestKm = voters[0].c.km;
  const confidence: Confidence =
    nearestKm <= LIKELY.nearestKm && sites.length >= LIKELY.sites && shares[best] >= LIKELY.share ? "likely"
    : nearestKm <= ROUGH.nearestKm && sites.length >= ROUGH.sites ? "rough"
    : "none";
  return { shares, likely: confidence === "none" ? null : best, confidence, sources };
}
