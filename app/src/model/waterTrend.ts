/**
 * How fast the water level is changing: feet per year it gets deeper (positive) or shallower.
 * Measured at the same borewells where they were read more than once, a year or more apart;
 * otherwise, roughly, from different borewells nearby measured in different years.
 */
import type { Borewell, WaterReading } from "@strata/core";

export interface Reading {
  /** The borewell's record id. */
  id: string;
  latitude: number;
  longitude: number;
  /** When, as a year with its fraction (2024.5 is about the start of July 2024). */
  year: number;
  /** Feet below ground. */
  feet: number;
}

export interface Trend {
  ftPerYear: number;
  from: "same" | "area";
}

/** Within this distance of a square its readings count. */
const NEAR_KM = 2;
/** Distances closer than this count as this, so one borewell on the square does not count without limit. */
const CLOSEST_KM = 0.1;
/**
 * The area trend compares different wells, which differ by far more than a few years' change; with
 * few readings it would mostly show that difference as a strong trend. So it needs many.
 */
const AREA = { readings: 15, years: 2 };

const yearOf = (iso: string) => {
  const d = new Date(`${iso.trim().slice(0, 10)}T00:00:00Z`);
  const y = d.getUTCFullYear();
  return Number.isNaN(y) ? null : y + (d.getTime() - Date.UTC(y, 0, 1)) / (365.25 * 86_400_000);
};

/**
 * Every dated water level of located borewells: their readings with the level at rest, and their own
 * level too unless a reading of that day already gives it (it is usually the newest reading's).
 */
export function readingsOf(sites: { borewell: Borewell; waterReadings: WaterReading[] }[]): Reading[] {
  const out: Reading[] = [];
  for (const { borewell: b, waterReadings } of sites) {
    if (b.latitude == null || b.longitude == null) continue;
    const dated = waterReadings.filter((r) => r.staticLevel != null).map((r) => [r.measuredOn, r.staticLevel!] as const);
    const day = (on: string) => on.trim().slice(0, 10);
    if (b.waterLevelOn && b.waterLevel != null && !dated.some(([on]) => day(on) === day(b.waterLevelOn!))) dated.push([b.waterLevelOn, b.waterLevel]);
    for (const [on, feet] of dated) {
      const year = yearOf(on);
      if (year != null) out.push({ id: b.id, latitude: b.latitude, longitude: b.longitude, year, feet });
    }
  }
  return out;
}

/** Feet per year of the straight line through the readings (least squares); null without a spread of dates. */
export function lineThrough(points: { year: number; feet: number }[]): number | null {
  const n = points.length, my = points.reduce((s, p) => s + p.year, 0) / n, mf = points.reduce((s, p) => s + p.feet, 0) / n;
  let sxy = 0, sxx = 0;
  for (const p of points) {
    sxy += (p.year - my) * (p.feet - mf);
    sxx += (p.year - my) ** 2;
  }
  return sxx > 0 ? sxy / sxx : null;
}

const span = (rs: Reading[]) => Math.max(...rs.map((r) => r.year)) - Math.min(...rs.map((r) => r.year));

/** The change per year at each borewell read at least twice, a year or more apart. */
export function sameBorewellTrends(readings: Reading[]): { latitude: number; longitude: number; ftPerYear: number }[] {
  const byBorewell = new Map<string, Reading[]>();
  for (const r of readings) byBorewell.set(r.id, [...(byBorewell.get(r.id) ?? []), r]);
  return [...byBorewell.values()]
    .filter((rs) => rs.length >= 2 && span(rs) >= 1)
    .map((rs) => ({ latitude: rs[0].latitude, longitude: rs[0].longitude, ftPerYear: lineThrough(rs)! }));
}

export function trendAt(latitude: number, longitude: number, readings: Reading[], same: ReturnType<typeof sameBorewellTrends>): Trend | null {
  const kx = 111.32 * Math.cos((latitude * Math.PI) / 180);
  const km = (p: { latitude: number; longitude: number }) => Math.hypot((p.longitude - longitude) * kx, (p.latitude - latitude) * 110.57);

  let total = 0, weighted = 0;
  for (const t of same) {
    const d = km(t);
    if (d > NEAR_KM) continue;
    const w = 1 / Math.max(d, CLOSEST_KM) ** 2;
    total += w;
    weighted += w * t.ftPerYear;
  }
  if (total > 0) return { ftPerYear: weighted / total, from: "same" };

  const near = readings.filter((r) => km(r) <= NEAR_KM);
  if (near.length < AREA.readings || span(near) < AREA.years) return null;
  return { ftPerYear: lineThrough(near)!, from: "area" };
}
