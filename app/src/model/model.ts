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

/** The group with the largest share; a tie goes to the earlier group. */
export const largest = (shares: Record<Group, number>) => GROUPS.reduce((a, b) => (shares[b] > shares[a] ? b : a));

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
  const near: Near[] = [];
  for (const p of prepared) {
    if (p.id === options.exclude) continue;
    const x = (p.longitude - longitude) * kx, y = (p.latitude - latitude) * 110.57, km = Math.hypot(x, y);
    if (km <= RADIUS_KM) near.push({ p, x, y, km, run: 0 });
  }
  near.sort((a, b) => a.km - b.km);

  const deepestFt = Math.max(0, ...near.map((c) => groundFt - c.p.bottomFt));
  const column: Step[] = [];
  let who: Near[] = [], said: Group[] = [], seats: Seats | null = null, counted: Counted | null = null;
  for (let top = 0; top < deepestFt; top += STEP_FT) {
    const middle = groundFt - (top + STEP_FT / 2);
    // ponytail: the 12 nearest borewells, not sites; a spot with 12 or more logs crowds out everyone else. Limit by site if real records show it.
    const nowWho: Near[] = [], nowSaid: Group[] = [];
    // Going down, each borewell is followed through its own layers (`run`), and dropped for good
    // once the step is below its bottom. This is `groupAt` without starting from the top each time.
    let kept = 0;
    for (const c of near) {
      const runs = c.p.runs;
      while (c.run < runs.length && runs[c.run].bottomFt >= middle) c.run++;
      if (c.run === runs.length) continue;
      near[kept++] = c;
      if (nowWho.length < MAX_VOTERS && runs[c.run].topFt >= middle) {
        nowWho.push(c);
        nowSaid.push(runs[c.run].group);
      }
    }
    near.length = kept;
    // From one step down to the next the same borewells usually vote, and often the same way, so
    // the work is shared: steps of one column may hold the same `shares` and `sources`.
    const sameWho = seats !== null && nowWho.length === who.length && nowWho.every((c, i) => c === who[i]);
    if (!seats || !sameWho) seats = seat(nowWho);
    if (!counted || !sameWho || nowSaid.some((g, i) => g !== said[i])) counted = count(seats, nowSaid);
    who = nowWho;
    said = nowSaid;
    column.push({ top, bottom: top + STEP_FT, ...counted });
  }
  return column;
}

/** A borewell within reach of the asked point: `x`, `y` and `km` are from that point; `run` is the layer it has got down to. */
type Near = { p: Prepared; x: number; y: number; km: number; run: number };

/** Who votes on a step and how much each counts, before anyone says what they logged. */
type Seats = { sources: Source[]; total: number; sites: number; nearestKm: number };
type Counted = Pick<Step, "shares" | "likely" | "confidence" | "sources">;

const beside = (a: Near, b: Near) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= SAME_SITE_KM ** 2;

function seat(voters: Near[]): Seats {
  const sources: Source[] = [];
  let total = 0;
  for (const c of voters) {
    // Crowded sites don't shout: borewells close together share their vote.
    let crowd = 0;
    for (const other of voters) if (beside(other, c)) crowd++;
    const weight = c.p.weight / Math.max(c.km, MIN_DISTANCE_KM) ** 2 / crowd;
    total += weight;
    sources.push({ id: c.p.id, borewellId: c.p.borewellId, km: c.km, weight });
  }
  // Separate sites, nearest first: a voter starts a new one unless it is beside an earlier site.
  const sites: Near[] = [];
  for (const c of voters) if (!sites.some((s) => beside(s, c))) sites.push(c);
  return { sources, total, sites: sites.length, nearestKm: voters[0]?.km ?? Infinity };
}

function count({ sources, total, sites, nearestKm }: Seats, said: Group[]): Counted {
  if (sources.length === 0) return { shares: null, likely: null, confidence: "none", sources };

  const shares: Record<Group, number> = { clay: 0, fineSand: 0, waterBearing: 0, hard: 0 };
  for (let i = 0; i < said.length; i++) shares[said[i]] += sources[i].weight;
  for (const g of GROUPS) shares[g] /= total; // divided once at the end, so a unanimous vote is exactly 1

  const best = largest(shares);
  const confidence: Confidence =
    nearestKm <= LIKELY.nearestKm && sites >= LIKELY.sites && shares[best] >= LIKELY.share ? "likely"
    : nearestKm <= ROUGH.nearestKm && sites >= ROUGH.sites ? "rough"
    : "none";
  return { shares, likely: confidence === "none" ? null : best, confidence, sources };
}
