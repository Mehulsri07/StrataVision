/**
 * A slice of ground cut out behind a section, like a slice of cake: the front is the section
 * itself, the back a cut parallel to it, the ends cuts across. Every side is an ordinary section,
 * so it is drawn exactly as the flat drawing is. Positions are km east and north of A.
 */
import { placeAlongPath, type Borewell, type ElevationGrid, type LatLon } from "@strata/core";
import type { Prepared } from "./model";
import { distinctPoints, heightRange, sectionAlong, type Section } from "./section";

/** km east, km north. */
export type XY = [number, number];

export interface Face {
  kind: "front" | "back" | "end";
  /** Drawn from `from` to `to`; its outside is on the right walking that way. */
  from: XY;
  to: XY;
  section: Section;
}

export interface Pin {
  id: string;
  borewellId: string;
  at: XY;
}

export interface Slice {
  faces: Face[];
  /** The strip of ground on top: along the line, then back along the far side. */
  top: XY[];
  pins: Pin[];
  highFt: number;
  lowFt: number;
}

/** Borewells this close to a back or end cut are drawn on it. */
const ON_CUT_KM = 0.05;
/** Columns along the whole front (and the whole back), and across each end. */
const COLUMNS = 200, END_COLUMNS = 40;
/** A corner of the back is never further out than this many depths, however sharp the turn. */
const MITRE_CAP = 3;

/** The line moved `km` to its left, its corners mitred. */
export function offsetPath(points: XY[], km: number): XY[] {
  const left = points.slice(1).map((q, i) => {
    const [dx, dy] = [q[0] - points[i][0], q[1] - points[i][1]], len = Math.hypot(dx, dy);
    return [-dy / len, dx / len] as XY;
  });
  return points.map((p, i) => {
    const a = left[Math.max(0, i - 1)], b = left[Math.min(left.length - 1, i)];
    const [mx, my] = [a[0] + b[0], a[1] + b[1]], m = Math.hypot(mx, my);
    if (m < 1e-9) return [p[0] + a[0] * km * MITRE_CAP, p[1] + a[1] * km * MITRE_CAP]; // turned right back
    const reach = Math.min(km / ((mx * a[0] + my * a[1]) / m), km * MITRE_CAP);
    return [p[0] + (mx / m) * reach, p[1] + (my / m) * reach];
  });
}

/** The slice `depthKm` deep behind a line; null without a line. */
export function sliceAlong(given: LatLon[], corridorKm: number, depthKm: number, prepared: Prepared[], grid: ElevationGrid, borewells: Borewell[]): Slice | null {
  const path = distinctPoints(given);
  if (path.length < 2) return null;
  const [lat0, lon0] = path[0], kx = 111.32 * Math.cos((lat0 * Math.PI) / 180), ky = 110.57;
  const toXY = ([la, lo]: LatLon): XY => [(lo - lon0) * kx, (la - lat0) * ky];
  const toLL = ([x, y]: XY): LatLon => [lat0 + y / ky, lon0 + x / kx];

  const front = path.map(toXY), back = offsetPath(front, depthKm);
  const lengths = front.slice(1).map((q, i) => Math.hypot(q[0] - front[i][0], q[1] - front[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const share = (i: number) => Math.max(20, Math.round((COLUMNS * lengths[i]) / total));
  const cut = (from: XY, to: XY, halfWidthKm: number, count: number) => sectionAlong([toLL(from), toLL(to)], halfWidthKm, prepared, grid, borewells, count);
  const n = front.length - 1;

  const faces: Face[] = [
    ...lengths.map((_, i): Face => ({ kind: "front", from: front[i], to: front[i + 1], section: cut(front[i], front[i + 1], corridorKm, share(i)) })),
    // The back and the ends are drawn so that each reads left to right from outside the slice.
    ...lengths.map((_, i): Face => ({ kind: "back", from: back[i + 1], to: back[i], section: cut(back[i + 1], back[i], ON_CUT_KM, share(i)) })),
    { kind: "end", from: back[0], to: front[0], section: cut(back[0], front[0], ON_CUT_KM, END_COLUMNS) },
    { kind: "end", from: front[n], to: back[n], section: cut(front[n], back[n], ON_CUT_KM, END_COLUMNS) },
  ];
  const range = heightRange(faces.map((f) => f.section));
  if (!range) return null;
  // Left of the line is behind it.
  const pins = placeAlongPath(path, depthKm, prepared).placed
    .filter((p) => p.offsetKm < 0)
    .map(({ item }) => ({ id: item.id, borewellId: item.borewellId, at: toXY([item.latitude, item.longitude]) }));
  return { faces, top: [...front, ...[...back].reverse()], pins, ...range };
}
