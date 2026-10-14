/**
 * The city map: the model asked at points on a grid over the city, each kept small (the likeliest
 * ground and how sure, step by step, and the first water-bearing sand), then painted into a picture
 * for one of three modes. Paler where a rough guess; empty where there is not enough data.
 */
import { GROUPS } from "./groups";
import { STEP_FT } from "./constants";
import type { ElevationGrid } from "@strata/core";
import { predictColumn, type Prepared } from "./model";
import type { Trend } from "./waterTrend";
import { GROUP_COLOUR } from "./words";

export interface CityPoint {
  /** One per step from the surface: 0 where nothing is proposed, else 1 + group index × 2, + 1 for a rough guess. */
  codes: Uint8Array;
  /** The top of the first water-bearing sand at least 10 ft thick, and the weaker level of its first 10 ft. */
  firstWet: { top: number; level: "likely" | "rough" } | null;
}

export interface CityGrid {
  south: number;
  west: number;
  north: number;
  east: number;
  cols: number;
  rows: number;
  /** Row by row from the north-west corner; null where the ground height is not known. */
  points: (CityPoint | null)[];
  /** How fast the water level changes at each point, in the same order. */
  trends: (Trend | null)[];
}

export type CityMode = "ground" | "wet" | "thick" | "thin" | "trend";

/** The thinnest water-bearing sand counted, as for slotted pipe. */
const MIN_WET_FT = 10;
/** How far past the outermost borewells the map goes. */
const MARGIN_KM = 2;
/** About how many points the map is worked out at. */
const POINTS = 10_000;

export function cityPoint(latitude: number, longitude: number, prepared: Prepared[], grid: ElevationGrid): CityPoint | null {
  const column = predictColumn(latitude, longitude, prepared, grid);
  if (!column) return null;
  const codes = new Uint8Array(column.length);
  let firstWet: CityPoint["firstWet"] = null, run: { top: number; rough: boolean } | null = null;
  column.forEach((s, i) => {
    codes[i] = s.likely ? 1 + GROUPS.indexOf(s.likely) * 2 + (s.confidence === "rough" ? 1 : 0) : 0;
    if (firstWet) return;
    if (s.likely === "waterBearing") {
      run = run ? { top: run.top, rough: run.rough || s.confidence === "rough" } : { top: s.top, rough: s.confidence === "rough" };
      if (s.bottom - run.top >= MIN_WET_FT) firstWet = { top: run.top, level: run.rough ? "rough" : "likely" };
    } else run = null;
  });
  return { codes, firstWet };
}

/**
 * The borewells' extent with room around it, kept within the ground-height data (nothing can be
 * proposed outside it, and one far-off borewell must not stretch the map), and split into about
 * 10,000 square cells. Null with no borewell, or none within the data.
 */
export function cityArea(prepared: Prepared[], grid: ElevationGrid) {
  if (!prepared.length) return null;
  const lats = prepared.map((p) => p.latitude), lons = prepared.map((p) => p.longitude);
  const kx = 111.32 * Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
  const dLat = MARGIN_KM / 110.57, dLon = MARGIN_KM / kx;
  const south = Math.max(grid.south, Math.min(...lats) - dLat), north = Math.min(grid.north, Math.max(...lats) + dLat);
  const west = Math.max(grid.west, Math.min(...lons) - dLon), east = Math.min(grid.east, Math.max(...lons) + dLon);
  if (south >= north || west >= east) return null;
  const aspect = ((east - west) * kx) / ((north - south) * 110.57);
  const cols = Math.max(1, Math.round(Math.sqrt(POINTS * aspect)));
  return { south, north, west, east, cols, rows: Math.max(1, Math.floor(POINTS / cols)) };
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const GROUP_RGB = GROUPS.map((g) => rgb(GROUP_COLOUR[g]));
const SURE = 200, ROUGH = 90;

type Ramp = [number, number[]][];
/** Depth to water-bearing sand: light where shallow, dark where deep. */
export const WET_RAMP: Ramp = [[0, [207, 238, 240]], [60, [116, 186, 214]], [120, [46, 102, 179]], [200, [61, 44, 141]], [300, [30, 20, 70]]];
/** Feet of water-bearing sand: pale where little, the sand's own colour and darker where much. */
export const THICK_RAMP: Ramp = [[0, [247, 240, 220]], [25, [226, 196, 120]], [50, [196, 154, 60]], [100, [140, 100, 30]], [200, [80, 55, 15]]];
/** Feet a year the water gets deeper: blue where it is rising, red where it is falling. */
export const TREND_RAMP: Ramp = [[-5, [33, 102, 172]], [-1, [146, 197, 222]], [0, [240, 240, 240]], [1, [244, 165, 130]], [5, [178, 24, 43]]];

/** The colour for a value, between the ramp's stops; past either end, the end's colour. */
export function ramp(r: Ramp, value: number) {
  const i = r.findIndex(([f]) => f > value);
  if (i <= 0) return i === 0 ? r[0][1] : r[r.length - 1][1];
  const [[f0, c0], [f1, c1]] = [r[i - 1], r[i]], t = (value - f0) / (f1 - f0);
  return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
}

const WET = GROUPS.indexOf("waterBearing");

/**
 * Feet of water-bearing sand proposed from the surface down to `depthFt`, and whether any of it is
 * a rough guess. Null where the column ends before that depth or more than half of it has no proposal.
 */
export function thickness(codes: Uint8Array, depthFt: number) {
  const steps = Math.floor(depthFt / STEP_FT);
  if (steps === 0 || codes.length < steps) return null;
  let wet = 0, rough = false, unknown = 0;
  for (let i = 0; i < steps; i++) {
    const code = codes[i];
    if (!code) unknown++;
    else if ((code - 1) >> 1 === WET) {
      wet++;
      rough ||= ((code - 1) & 1) === 1;
    }
  }
  return unknown * 2 > steps ? null : { feet: wet * STEP_FT, rough };
}
const THIN_RGB = [13, 104, 131];

/** The map as RGBA pixels, one per point, rows from the north. `depthFt` is used by "ground", "thick" and "thin". */
export function paint(g: CityGrid, mode: CityMode, depthFt: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(g.points.length * 4), step = Math.floor(depthFt / STEP_FT);
  g.points.forEach((p, i) => {
    let colour: number[] | null = null, alpha = 0;
    const trend = g.trends[i];
    if (mode === "trend") {
      if (trend) [colour, alpha] = [ramp(TREND_RAMP, trend.ftPerYear), trend.from === "same" ? SURE : ROUGH];
    } else if (p && mode === "wet") {
      if (p.firstWet) [colour, alpha] = [ramp(WET_RAMP, p.firstWet.top), p.firstWet.level === "likely" ? SURE : ROUGH];
    } else if (p && mode === "thick") {
      const t = thickness(p.codes, depthFt);
      if (t) [colour, alpha] = [ramp(THICK_RAMP, t.feet), t.rough ? ROUGH : SURE];
    } else if (p) {
      const code = p.codes[step] ?? 0;
      if (code) [colour, alpha] = [mode === "ground" ? GROUP_RGB[(code - 1) >> 1] : THIN_RGB, (code - 1) & 1 ? ROUGH : SURE];
    }
    if (colour) out.set([...colour, alpha], i * 4);
  });
  return out;
}
