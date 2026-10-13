/**
 * The honesty check: hide each borewell in turn, predict it from the others, and count how often
 * the model's best guess matched what was really logged. This is the number that should go up as
 * borewells are added, and it shows whether "likely" really means likely on the real records.
 *
 * Everything at the hidden borewell's spot is hidden with it. The records have many borewells side
 * by side, and two logs of the same spot agreeing says nothing about a place nobody drilled.
 *
 * It also finds the odd ones out: borewells that disagree with their surroundings far more than is
 * usual, which are most often a slip in typing or a pin in the wrong place.
 */
import { METRES_TO_FEET, kmBetween, type ElevationGrid } from "@strata/core";
import { MIN_BOREWELLS_TO_JUDGE, ODD, SAME_SITE_KM } from "./constants";
import { groupAt, largest, predictColumn, type Prepared } from "./model";

/** How many steps were compared, and in how many the best guess was right. */
export interface Tally {
  steps: number;
  right: number;
}

export interface OddOne {
  id: string;
  borewellId: string;
  /** Its own score where it fits worst: steps compared, and how many matched. */
  steps: number;
  right: number;
  /** The usual share right for borewells judged from as far away. */
  typical: number;
}

type Band = "under1" | "from1to3" | "over3";
const BANDS: Band[] = ["under1", "from1to3", "over3"];

export interface CheckResult {
  /** False with too few borewells to compare; the numbers are then not worth showing. */
  canJudge: boolean;
  /** Borewells for which at least one step could be compared. */
  compared: number;
  /** Steps the model would show as an estimate: likely and rough together. */
  overall: Tally;
  likely: Tally;
  rough: Tally;
  /** Best guesses the model would not show ("not enough data"), scored all the same. */
  none: Tally;
  /** Every scored step, by how far away the nearest borewell behind that step was, in km. */
  byDistance: Record<Band, Tally>;
  /** Worst first. */
  oddOnesOut: OddOne[];
}

/** The share right, or null when nothing was compared. */
export const share = (t: Tally) => (t.steps === 0 ? null : t.right / t.steps);

const tally = (): Tally => ({ steps: 0, right: 0 });
const add = (t: Tally, right: number) => {
  t.steps++;
  t.right += right;
};

/** The middle value. (core's `median` rounds to one decimal, which is too coarse for shares.) */
function middle(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function checkModel(prepared: Prepared[], grid: ElevationGrid): CheckResult {
  const result: CheckResult = {
    canJudge: false, compared: 0, overall: tally(), likely: tally(), rough: tally(), none: tally(),
    byDistance: { under1: tally(), from1to3: tally(), over3: tally() }, oddOnesOut: [],
  };
  /** Each compared borewell's own score, by how far away it was judged from. */
  const each: { p: Prepared; own: Record<Band, Tally> }[] = [];

  for (const p of prepared) {
    const spot = new Set<string>();
    for (const q of prepared) if (kmBetween(p.latitude, p.longitude, q.latitude, q.longitude) <= SAME_SITE_KM) spot.add(q.id);
    // Predicted standing where it stands: same place, same ground height, its own spot left out.
    const column = predictColumn(p.latitude, p.longitude, prepared, grid, { exclude: spot, groundM: p.groundFt / METRES_TO_FEET });
    if (!column) continue;

    const own: Record<Band, Tally> = { under1: tally(), from1to3: tally(), over3: tally() };
    let any = false;
    for (const step of column) {
      const logged = groupAt(p, p.groundFt - (step.top + step.bottom) / 2);
      if (!step.shares || !logged) continue; // nobody else reaches this step, or it logged nothing here
      const right = largest(step.shares) === logged ? 1 : 0;
      // A deep borewell beside a shallow one is judged from far away below the shallow one's bottom,
      // so the distance is taken step by step, not once for the borewell.
      const km = step.sources[0].km;
      const band: Band = km < 1 ? "under1" : km <= 3 ? "from1to3" : "over3";
      add(result[step.confidence], right);
      if (step.confidence !== "none") add(result.overall, right);
      add(result.byDistance[band], right);
      add(own[band], right);
      any = true;
    }
    if (any) each.push({ p, own });
  }

  result.compared = each.length;
  result.canJudge = each.length >= MIN_BOREWELLS_TO_JUDGE;
  if (!result.canJudge) return result;

  // A borewell is odd where it matches less than half as often as is usual at that distance. It is
  // listed once, with its score where it fits worst.
  const worst = new Map<string, OddOne>();
  for (const band of BANDS) {
    const judged = each.filter((e) => e.own[band].steps >= ODD.minSteps);
    if (judged.length < ODD.minBorewells) continue;
    const typical = middle(judged.map((e) => share(e.own[band])!))!;
    for (const { p, own } of judged) {
      const mine = share(own[band])!;
      const before = worst.get(p.id);
      if (mine < ODD.fraction * typical && (!before || mine < before.right / before.steps)) {
        worst.set(p.id, { id: p.id, borewellId: p.borewellId, ...own[band], typical });
      }
    }
  }
  result.oddOnesOut = [...worst.values()].sort((a, b) => a.right / a.steps - b.right / b.steps);
  return result;
}
