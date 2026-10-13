import { text } from "@/text";
import { MIN_BOREWELLS_TO_SAY, MIN_STEPS_TO_SAY, STEP_FT } from "./constants";
import { share, type CheckResult, type Tally } from "./check";
import { howOften } from "./words";

/**
 * What the Data quality screen says about the accuracy check, in order. A line is left out when
 * too little of its kind was tested to mean anything; nothing is said when there are too few
 * borewells to judge.
 */
export function qualitySentences(check: CheckResult): string[] {
  if (!check.canJudge) return [];
  const t = text.quality;
  const lines: [Tally, (often: string) => string][] = [
    [check.likely, t.likely], [check.rough, t.rough],
    [check.byDistance.under1, t.under1], [check.byDistance.from1to3, t.from1to3], [check.byDistance.over3, t.over3],
  ];
  return [t.checked(check.compared), ...lines.flatMap(([tally, say]) => {
    const right = share(tally);
    return right == null || tally.steps < MIN_STEPS_TO_SAY || tally.borewells < MIN_BOREWELLS_TO_SAY ? [] : [say(howOften(right))];
  })];
}

/** How much of an odd borewell matched its surroundings, in feet: "15 of 120 ft". */
export const matchedInWords = (odd: { right: number; steps: number }) => text.quality.matchedFeet(odd.right * STEP_FT, odd.steps * STEP_FT);
