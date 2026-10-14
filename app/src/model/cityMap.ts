/**
 * The city map: the model asked at points on a grid over the city, each kept small (the likeliest
 * ground and how sure, step by step, and the first water-bearing sand), then painted into a picture
 * for one of three modes. Paler where a rough guess; empty where there is not enough data.
 */
import { GROUPS } from "./groups";
import { STEP_FT } from "./constants";
import { predictColumn, type Prepared } from "./model";
import { GROUP_COLOUR } from "./words";

export interface CityPoint {
  /** One per step from the surface: 0 where nothing is proposed, else 1 + group index × 2, + 1 for a rough guess. */
  codes: Uint8Array;
  /** The top of the first water-bearing sand at least 10 ft thick, and the weaker level of its steps. */
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
}

export type CityMode = "ground" | "wet" | "thin";

/** The thinnest water-bearing sand counted, as for slotted pipe. */
const MIN_WET_FT = 10;
/** How far past the outermost borewells the map goes. */
const MARGIN_KM = 2;

export function cityPoint(latitude: number, longitude: number, prepared: Prepared[], grid: Parameters<typeof predictColumn>[3]): CityPoint | null {
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

/** The borewells' extent with room around it; null with no borewells. */
export function cityArea(prepared: Prepared[]) {
  if (!prepared.length) return null;
  const lats = prepared.map((p) => p.latitude), lons = prepared.map((p) => p.longitude);
  const [south, north] = [Math.min(...lats), Math.max(...lats)];
  const dLat = MARGIN_KM / 110.57, dLon = MARGIN_KM / (111.32 * Math.cos((((south + north) / 2) * Math.PI) / 180));
  return { south: south - dLat, north: north + dLat, west: Math.min(...lons) - dLon, east: Math.max(...lons) + dLon };
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const GROUP_RGB = GROUPS.map((g) => rgb(GROUP_COLOUR[g]));
const SURE = 200, ROUGH = 90;

/** Depth to water-bearing sand: light where shallow, dark where deep. */
export const WET_RAMP: [number, number[]][] = [[0, [207, 238, 240]], [60, [116, 186, 214]], [120, [46, 102, 179]], [200, [61, 44, 141]], [300, [30, 20, 70]]];
export function wetColour(feet: number) {
  const r = WET_RAMP, i = r.findIndex(([f]) => f > feet);
  if (i <= 0) return i === 0 ? r[0][1] : r[r.length - 1][1];
  const [[f0, c0], [f1, c1]] = [r[i - 1], r[i]], t = (feet - f0) / (f1 - f0);
  return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
}
const THIN_RGB = [13, 104, 131];

/** The map as RGBA pixels, one per point, rows from the north. `depthFt` is used by "ground" and "thin". */
export function paint(g: CityGrid, mode: CityMode, depthFt: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(g.points.length * 4), step = Math.floor(depthFt / STEP_FT);
  g.points.forEach((p, i) => {
    let colour: number[] | null = null, alpha = 0;
    if (p && mode === "wet") {
      if (p.firstWet) [colour, alpha] = [wetColour(p.firstWet.top), p.firstWet.level === "likely" ? SURE : ROUGH];
    } else if (p) {
      const code = p.codes[step] ?? 0;
      if (code) [colour, alpha] = [mode === "ground" ? GROUP_RGB[(code - 1) >> 1] : THIN_RGB, (code - 1) & 1 ? ROUGH : SURE];
    }
    if (colour) out.set([...colour, alpha], i * 4);
  });
  return out;
}
