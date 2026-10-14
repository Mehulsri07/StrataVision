/**
 * A section along a line with bends: the model's column at evenly spaced places along it, and the
 * borewells near it, placed by StrataField's own rule. Heights are feet above sea level, so the
 * drawing can line layers up by height whatever the ground does.
 */
import { METRES_TO_FEET, heightAt, kmBetween, placeAlongPath, thinAlongLine, type Borewell, type ElevationGrid, type LatLon } from "@strata/core";
import { predictColumn, type Prepared, type Step } from "./model";
import { waterHere } from "./words";

export interface SectionColumn {
  /** Distance along the line from its start. */
  km: number;
  latitude: number;
  longitude: number;
  /** Feet above sea level; null where the ground height is not known (and so nothing is proposed). */
  groundFt: number | null;
  steps: Step[] | null;
  /** Expected depth to water, feet below ground; null where there is no recent reading nearby. */
  waterFt: number | null;
}

export interface SectionBorewell {
  p: Prepared;
  alongKm: number;
  /** Distance from the line; positive is to the right walking from A to A′. */
  offsetKm: number;
}

export interface Section {
  lengthKm: number;
  columns: SectionColumn[];
  /** The borewells drawn, nearest the line in each stretch when there are too many. */
  borewells: SectionBorewell[];
  /** How many borewells are within reach of the line, drawn or not. */
  nearby: number;
  /** Where the line bends, as distances along it. */
  bendsKm: number[];
}

/** `count` evenly spaced places along a line with bends, with their distance along it. */
function placesAlong(path: LatLon[], count: number) {
  const parts = path.slice(1).map((b, i) => ({ a: path[i], b, km: kmBetween(path[i][0], path[i][1], b[0], b[1]) }));
  const total = parts.reduce((s, p) => s + p.km, 0);
  return Array.from({ length: count }, (_, n) => {
    const km = (n / (count - 1)) * total;
    let rest = km, i = 0;
    while (i < parts.length - 1 && rest > parts[i].km) rest -= parts[i++].km;
    const { a, b, km: len } = parts[i], t = len ? Math.min(1, rest / len) : 0;
    return { km, latitude: a[0] + (b[0] - a[0]) * t, longitude: a[1] + (b[1] - a[1]) * t };
  });
}

export function sectionAlong(path: LatLon[], halfWidthKm: number, prepared: Prepared[], grid: ElevationGrid, borewells: Borewell[], count = 200): Section {
  if (path.length < 2) return { lengthKm: 0, columns: [], borewells: [], nearby: 0, bendsKm: [] };
  const columns = placesAlong(path, count).map(({ km, latitude, longitude }) => {
    const groundM = heightAt(grid, latitude, longitude);
    return {
      km, latitude, longitude,
      groundFt: groundM == null ? null : groundM * METRES_TO_FEET,
      steps: predictColumn(latitude, longitude, prepared, grid, { groundM: groundM ?? undefined }),
      waterFt: waterHere(latitude, longitude, borewells)?.feet ?? null,
    };
  });
  const lengthKm = columns[columns.length - 1].km;
  const { placed } = placeAlongPath(path, halfWidthKm, prepared);
  const shown = thinAlongLine(placed, lengthKm);
  const bendsKm: number[] = [];
  for (let i = 1, km = 0; i < path.length - 1; i++) bendsKm.push((km += kmBetween(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1])));
  return { lengthKm, columns, borewells: shown.map(({ item, alongKm, offsetKm }) => ({ p: item, alongKm, offsetKm })), nearby: placed.length, bendsKm };
}
