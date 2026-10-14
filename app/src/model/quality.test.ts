import { describe, expect, it } from "vitest";
import type { CheckResult } from "./check";
import { matchedInWords, qualitySentences } from "./quality";

const t = (right: number, steps: number, borewells = 20) => ({ right, steps, borewells });
const result = (over: Partial<CheckResult>): CheckResult => ({
  canJudge: true, compared: 40, overall: t(150, 200), likely: t(90, 100), rough: t(60, 100), none: t(3, 10),
  byDistance: { under1: t(95, 100), from1to3: t(0, 0), over3: t(25, 100) }, oddOnesOut: [], ...over,
});

describe("qualitySentences", () => {
  it("says how often each kind of estimate was right, leaving out what was never tested", () => {
    expect(qualitySentences(result({}))).toEqual([
      "Checked against 40 borewells: each was hidden in turn and worked out from the others.",
      "Where it says Likely, it was right about 9 times in 10.",
      "Where it says Rough guess, it was right about 2 times in 3.",
      "With another borewell within 1 km, the best guess was right almost always.",
      "With the nearest borewell more than 3 km away, about 1 time in 4.",
    ]);
  });

  it("includes the middle distance when it was tested", () => {
    const sentences = qualitySentences(result({ byDistance: { under1: t(0, 0), from1to3: t(50, 100), over3: t(0, 0) } }));
    expect(sentences).toContain("With the nearest borewell 1 to 3 km away, about half the time.");
    expect(sentences).toHaveLength(4);
  });

  it("leaves out a line that rests on too few steps to mean anything", () => {
    const sentences = qualitySentences(result({ rough: t(49, 49), byDistance: { under1: t(95, 100), from1to3: t(3, 4), over3: t(50, 50) } }));
    expect(sentences).toHaveLength(4); // checked, likely, under 1 km, over 3 km
    expect(sentences.join(" ")).not.toContain("Rough guess");
    expect(sentences.join(" ")).not.toContain("1 to 3 km");
  });

  it("leaves out a line that rests on one deep borewell, however many steps that is", () => {
    const sentences = qualitySentences(result({ byDistance: { under1: t(95, 100), from1to3: t(0, 0), over3: t(60, 60, 1) } }));
    expect(sentences.join(" ")).not.toContain("more than 3 km");
  });

  it("says what the odd ones matched in feet", () => {
    expect(matchedInWords({ right: 3, steps: 24 })).toBe("15 of 120 ft");
  });

  it("says nothing when there are too few borewells to judge", () => {
    expect(qualitySentences(result({ canJudge: false }))).toEqual([]);
  });
});
