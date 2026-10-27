/**
 * A drilling suggestion for a picked spot, in two halves always shown together: what was done at
 * the nearest sites, and what the records suggest. It reads the model's column and never changes it.
 * The driller decides; the rule for how deep to drill is an assumption to confirm with DWO.
 */
import { METRES_TO_FEET, heightAt, type ElevationGrid, type PipeSegment } from "@strata/core";
import { ROUGH, SAME_SITE_KM } from "./constants";
import type { ModelSite, Step } from "./model";
import type { WaterHere } from "./words";

export type SiteWithPipes = ModelSite & { pipes: PipeSegment[] };

/** Feet below ground. */
export interface Span {
  top: number;
  bottom: number;
}

export interface NearbyWell {
  id: string;
  borewellId: string;
  km: number;
  /** How deep it was drilled, feet; null when not recorded. */
  drilledFt: number | null;
  /** How deep its pump hangs, feet; null when not recorded. */
  pumpFt: number | null;
  /** Its slotted pipe, moved to the picked spot's depths by height above sea level. */
  slotted: Span[];
}

/** The lowest, middle and highest of some values. */
export interface Spread {
  low: number;
  middle: number;
  high: number;
}

export interface Suggestion {
  nearby: NearbyWell[];
  drilled: Spread | null;
  pump: Spread | null;
  proposal: {
    waterFt: number;
    slotted: (Span & { level: "likely" | "rough" })[];
    drillToFt: number;
    /** Whether the depth was held to the deepest borewell nearby, or none nearby records its depth. */
    limit: "deepestNearby" | "noneKnown";
  } | null;
  /**
   * Why nothing is proposed: no expected water level; no water-bearing stretch to put slotted pipe
   * in; or every borewell nearby stopped above it.
   */
  noProposal: "noWater" | "noWaterBearing" | "nearbyShallower" | null;
}

/** How many sites count as "nearby", and the thinnest water-bearing stretch worth slotted pipe. */
const NEARBY_SITES = 5;
const MIN_SLOTTED_FT = 10;

const groundFt = (grid: ElevationGrid, b: ModelSite["borewell"]) => {
  const m = b.groundElevationM ?? heightAt(grid, b.latitude!, b.longitude!);
  return m == null ? null : m * METRES_TO_FEET;
};

/** The nearest sites within reach of a spot, each represented by its nearest borewell. */
export function nearbyWells(latitude: number, longitude: number, sites: SiteWithPipes[], grid: ElevationGrid): NearbyWell[] {
  const kx = 111.32 * Math.cos((latitude * Math.PI) / 180);
  const here = heightAt(grid, latitude, longitude);
  const candidates = sites
    .filter((s) => s.borewell.latitude != null && s.borewell.longitude != null)
    .map((s) => {
      const x = (s.borewell.longitude! - longitude) * kx, y = (s.borewell.latitude! - latitude) * 110.57;
      return { s, x, y, km: Math.hypot(x, y) };
    })
    .filter((c) => c.km <= ROUGH.nearestKm)
    .sort((a, b) => a.km - b.km);

  const chosen: typeof candidates = [];
  for (const c of candidates) {
    if (chosen.length === NEARBY_SITES) break;
    // A crowded site counts once, by its nearest borewell.
    if (!chosen.some((o) => Math.hypot(o.x - c.x, o.y - c.y) <= SAME_SITE_KM)) chosen.push(c);
  }

  return chosen.map(({ s: { borewell: b, pipes }, km }) => {
    const own = groundFt(grid, b);
    // Its depths become the spot's depths at the same height. Where either ground height is unknown
    // that cannot be done, so its pipe is not drawn at all rather than drawn at the wrong height.
    const shift = here != null && own != null ? here * METRES_TO_FEET - own : null;
    return {
      id: b.id, borewellId: b.borewellId, km,
      // Only the total depth follows an old record's unit; pipes and the pump are always feet.
      drilledFt: b.totalDepth != null ? b.totalDepth * (b.depthUnit === "m" ? METRES_TO_FEET : 1) : null,
      pumpFt: b.pumpLowering ?? null,
      slotted: shift == null ? [] : pipes
        .filter((p) => p.pipeType === "slotted" && p.endDepth > p.startDepth)
        .map((p) => ({ top: p.startDepth + shift, bottom: p.endDepth + shift }))
        .filter((p) => p.bottom > 0)
        .sort((a, b) => a.top - b.top),
    };
  });
}

function middleOf(sorted: number[]) {
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

const spread = (values: (number | null)[]): Spread | null => {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b);
  return v.length ? { low: v[0], middle: middleOf(v), high: v[v.length - 1] } : null;
};

/**
 * Where the records suggest slotted pipe and how deep to drill, beside what was done nearby. Slotted
 * pipe goes in each water-bearing stretch the model shows (likely or rough) that is at least 10 ft
 * thick below the expected water level. Drill to the bottom of the lowest one, but never deeper than
 * the deepest borewell nearby. Null when there is nobody nearby to go by.
 */
export function suggestDrilling(column: readonly Step[], water: WaterHere | null, nearby: NearbyWell[]): Suggestion | null {
  if (nearby.length === 0) return null;
  const base = { nearby, drilled: spread(nearby.map((n) => n.drilledFt)), pump: spread(nearby.map((n) => n.pumpFt)) };
  if (!water) return { ...base, proposal: null, noProposal: "noWater" };

  const slotted: (Span & { level: "likely" | "rough" })[] = [];
  let open: { top: number; bottom: number; rough: boolean } | null = null;
  const close = () => {
    if (!open) return;
    const top = Math.max(open.top, water.feet);
    if (open.bottom - top >= MIN_SLOTTED_FT) slotted.push({ top, bottom: open.bottom, level: open.rough ? "rough" : "likely" });
    open = null;
  };
  for (const step of column) {
    const wet = step.likely === "waterBearing" && step.confidence !== "none";
    // Only the part below the water level gets slotted pipe, so only it says how sure the stretch is.
    const rough = step.confidence === "rough" && step.bottom > water.feet;
    if (!wet || (open && open.bottom !== step.top)) close();
    if (!wet) continue;
    if (open) {
      open.bottom = step.bottom;
      open.rough ||= rough;
    } else {
      open = { top: step.top, bottom: step.bottom, rough };
    }
  }
  close();

  if (slotted.length === 0) return { ...base, proposal: null, noProposal: "noWaterBearing" };
  // Never deeper than the deepest borewell nearby, and so never slotted pipe below that either.
  const deepest = base.drilled?.high ?? null;
  const reachable = slotted
    .map((p) => ({ ...p, bottom: deepest == null ? p.bottom : Math.min(p.bottom, deepest) }))
    .filter((p) => p.bottom - p.top >= MIN_SLOTTED_FT);
  if (reachable.length === 0) return { ...base, proposal: null, noProposal: "nearbyShallower" };
  return {
    ...base,
    proposal: { waterFt: water.feet, slotted: reachable, drillToFt: reachable[reachable.length - 1].bottom, limit: deepest == null ? "noneKnown" : "deepestNearby" },
    noProposal: null,
  };
}

export interface PipePiece extends Span {
  kind: "plain" | "slotted";
}

/**
 * The whole pipe from the surface to the bottom of the bore: slotted where suggested, plain
 * everywhere else, to the nearest foot, with the feet of each kind.
 */
export function pipePlan(slotted: Span[], drillToFt: number) {
  const pieces: PipePiece[] = [];
  let at = 0;
  for (const s of slotted) {
    const top = Math.round(s.top), bottom = Math.round(s.bottom);
    if (top > at) pieces.push({ top: at, bottom: top, kind: "plain" });
    pieces.push({ top, bottom, kind: "slotted" });
    at = bottom;
  }
  const end = Math.round(drillToFt);
  if (end > at) pieces.push({ top: at, bottom: end, kind: "plain" });
  const feet = (kind: PipePiece["kind"]) => pieces.filter((p) => p.kind === kind).reduce((s, p) => s + p.bottom - p.top, 0);
  return { pieces, plainFt: feet("plain"), slottedFt: feet("slotted") };
}

/** DWO's rates, rupees a foot; null until entered. */
export interface Rates {
  drillPerFt: number | null;
  plainPerFt: number | null;
  slottedPerFt: number | null;
}

/** What drilling and pipe would cost at the rates, in rupees; null until every rate is known. */
export function costOf(drillToFt: number, plan: ReturnType<typeof pipePlan>, rates: Rates) {
  const { drillPerFt, plainPerFt, slottedPerFt } = rates;
  if (drillPerFt == null || plainPerFt == null || slottedPerFt == null) return null;
  const drilling = Math.round(drillToFt) * drillPerFt, plain = plan.plainFt * plainPerFt, slotted = plan.slottedFt * slottedPerFt;
  return { drilling, plain, slotted, total: drilling + plain + slotted };
}
