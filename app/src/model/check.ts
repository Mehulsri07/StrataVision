/**
 * The honesty check: hide each borewell in turn, predict it from the others, and count how often
 * the model's best guess matched what was really logged. This is the number that should go up as
 * borewells are added, and it shows whether "likely" really means likely on the real records.
 *
 * It also finds the odd ones out: borewells that disagree with their surroundings far more than is
 * usual, which are most often a slip in typing or a pin in the wrong place.
 */
import { METRES_TO_FEET, kmBetween, type ElevationGrid } from "@strata/core";
import { MIN_BOREWELLS_TO_JUDGE, ODD } from "./constants";
import { groupAt, largest, predictColumn, type Prepared } from "./model";

/** How many steps were compared, and in how many the best guess was right. */
export interface Tally {
  steps: number;
  right: number;
}

export interface OddOne {
  id: string;
  borewellId: string;
  steps: number;
  right: number;
  /** The usual share right for borewells with neighbours as near as this one's. */
  typical: number;
}

type Band = "under1" | "from1to3" | "over3";

export interface CheckResult {
  /** False with too few borewells to compare; the numbers are then not worth showing. */
  canJudge: boolean;
  /** Borewells for which at least one step could be compared. */
  compared: number;
  overall: Tally;
  /** By how sure the model said it was. "none" steps are guesses it would not show as estimates. */
  likely: Tally;
  rough: Tally;
  none: Tally;
  /** By how far each borewell is from its nearest neighbour, in km. */
  byDistance: Record<Band, Tally>;
  /** Worst first. */
  oddOnesOut: OddOne[];
}

/** The share right, or null when nothing was compared. */
export const share = (t: Tally) => (t.steps === 0 ? null : t.right / t.steps);

const tally = (): Tally => ({ steps: 0, right: 0 });

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
  const each: { p: Prepared; band: Band; own: Tally }[] = [];

  for (const p of prepared) {
    // Predicted standing where it stands: same place, same ground height, itself left out.
    const column = predictColumn(p.latitude, p.longitude, prepared, grid, { exclude: p.id, groundM: p.groundFt / METRES_TO_FEET });
    if (!column) continue;
    let nearestKm = Infinity;
    for (const q of prepared) if (q !== p) nearestKm = Math.min(nearestKm, kmBetween(p.latitude, p.longitude, q.latitude, q.longitude));
    const band: Band = nearestKm < 1 ? "under1" : nearestKm <= 3 ? "from1to3" : "over3";

    const own = tally();
    for (const step of column) {
      const logged = groupAt(p, p.groundFt - (step.top + step.bottom) / 2);
      if (!step.shares || !logged) continue; // nobody else reaches this step, or it logged nothing here
      const right = largest(step.shares) === logged ? 1 : 0;
      for (const t of [own, result.overall, result[step.confidence], result.byDistance[band]]) {
        t.steps++;
        t.right += right;
      }
    }
    if (own.steps > 0) each.push({ p, band, own });
  }

  result.compared = each.length;
  result.canJudge = each.length >= MIN_BOREWELLS_TO_JUDGE;
  if (!result.canJudge) return result;

  const judged = each.filter((e) => e.own.steps >= ODD.minSteps);
  for (const band of ["under1", "from1to3", "over3"] as const) {
    const inBand = judged.filter((e) => e.band === band);
    const typical = middle(inBand.map((e) => e.own.right / e.own.steps));
    if (typical == null) continue;
    for (const { p, own } of inBand) {
      if (own.right / own.steps < ODD.fraction * typical) result.oddOnesOut.push({ id: p.id, borewellId: p.borewellId, ...own, typical });
    }
  }
  result.oddOnesOut.sort((a, b) => a.right / a.steps - b.right / b.steps);
  return result;
}
