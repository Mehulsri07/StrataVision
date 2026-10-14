/**
 * The model's numbers turned into what a person reads: names, plain phrases, and runs of steps to
 * draw. Kept apart from the screens so the wording can be tested without a browser.
 */
import { NEIGHBOURHOOD_KM, estimateWater, kmBetween, recentCutoff, waterPoints, type Borewell } from "@strata/core";
import { text } from "@/text";
import { GROUPS, type Group } from "./groups";
import type { Source, Step } from "./model";

export const GROUP_NAME: Record<Group, string> = text.groups;

/** Earth colours, as in StrataField. Water-bearing sand is the strongest, since it is what is looked for. */
export const GROUP_COLOUR: Record<Group, string> = { clay: "#A0785A", fineSand: "#E8D5A3", waterBearing: "#C49A3C", hard: "#7A7F85" };

const lower = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

/** "Clay" · "Mostly clay, some fine sand" · "Clay or water-bearing sand" */
export function sharesInWords(shares: Readonly<Record<Group, number>>): string {
  const [first, second, ...rest] = [...GROUPS].sort((a, b) => shares[b] - shares[a]); // a tie keeps the usual order
  if (shares[first] >= 0.9) return GROUP_NAME[first];
  if (shares[first] >= 0.6) {
    const some = [second, ...rest].filter((g) => shares[g] >= 0.1).map((g) => `, some ${lower(GROUP_NAME[g])}`);
    return `Mostly ${lower(GROUP_NAME[first])}${some.join("")}`;
  }
  return `${GROUP_NAME[first]} or ${lower(GROUP_NAME[second])}`;
}

/** "340 m" (to the nearest 10 m) under 1 km, otherwise "1.2 km". */
export function distanceInWords(km: number): string {
  const metres = Math.round(km * 100) * 10;
  return metres < 1000 ? `${metres} m` : `${km.toFixed(1)} km`;
}

const OFTEN: [number, string][] = [
  [0.9, "9 times in 10"], [0.8, "4 times in 5"], [0.75, "3 times in 4"], [0.67, "2 times in 3"],
  [0.5, "half the time"], [0.33, "1 time in 3"], [0.25, "1 time in 4"],
];

/** A share right as a plain phrase: "almost always", "about 3 times in 4", "rarely". */
export function howOften(shareRight: number): string {
  if (shareRight >= 0.95) return "almost always";
  if (shareRight < 0.2) return "rarely";
  return `about ${OFTEN.reduce((a, b) => (Math.abs(b[0] - shareRight) < Math.abs(a[0] - shareRight) ? b : a))[1]}`;
}

/** A run of neighbouring steps with the same likeliest group and the same level, for drawing and listing. */
export interface Block {
  top: number;
  bottom: number;
  /** Null where there is not enough data to propose anything. */
  group: Group | null;
  level: Step["confidence"];
  steps: Step[];
}

export function blocks(column: readonly Step[]): Block[] {
  const out: Block[] = [];
  for (const step of column) {
    const last = out[out.length - 1];
    if (last && last.group === step.likely && last.level === step.confidence && last.bottom === step.top) {
      last.bottom = step.bottom;
      last.steps.push(step);
    } else {
      // `likely` is null exactly when the level is "none", whatever was voted.
      out.push({ top: step.top, bottom: step.bottom, group: step.likely, level: step.confidence, steps: [step] });
    }
  }
  return out;
}

/**
 * What a whole stretch says, for its details: the shares averaged over its steps (a block is joined
 * on its likeliest group alone, so "some sand" in its lower part must not be lost), and every
 * borewell behind any of its steps, once, nearest first. Where there is not enough data nothing is
 * proposed and nobody is named.
 */
export function summary(block: Block): { shares: Record<Group, number> | null; sources: Source[] } {
  if (block.level === "none") return { shares: null, sources: [] };
  const shares: Record<Group, number> = { clay: 0, fineSand: 0, waterBearing: 0, hard: 0 };
  const sources = new Map<string, Source>();
  for (const step of block.steps) {
    for (const g of GROUPS) shares[g] += (step.shares?.[g] ?? 0) / block.steps.length;
    for (const s of step.sources) if (!sources.has(s.id)) sources.set(s.id, s);
  }
  return { shares, sources: [...sources.values()].sort((a, b) => a.km - b.km) };
}

export interface WaterHere {
  /** Expected depth to water, feet below ground. */
  feet: number;
  /** How far away the nearest reading used is. */
  nearestKm: number;
  /** The year from which readings were used, e.g. "2023". */
  since: string;
}

/**
 * The water level to expect at a spot, or null when no reading is good enough to say. Only dated
 * readings from the last few years count (the water moves, and nobody can say an undated reading is
 * recent), and only those within the same neighbourhood StrataField's water map uses.
 */
export function waterHere(latitude: number, longitude: number, borewells: Borewell[]): WaterHere | null {
  const dated = borewells.filter((b) => b.waterLevelOn);
  const since = recentCutoff(dated).slice(0, 4);
  const points = waterPoints(dated).filter((p) => kmBetween(latitude, longitude, p.latitude, p.longitude) <= NEIGHBOURHOOD_KM);
  const estimate = estimateWater(latitude, longitude, points);
  if (!estimate || !since) return null;
  return { feet: estimate.value, nearestKm: estimate.nearestKm, since };
}
