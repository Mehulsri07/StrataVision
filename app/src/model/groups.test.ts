import { describe, expect, it } from "vitest";
import { DEFAULT_MATERIALS, type Material } from "@strata/core";
import { groupOf, materialsById } from "./groups";

const handAdded = (id: string, lithologyFamily: Material["lithologyFamily"]): Material =>
  ({ id, name: id, color: "#000000", pattern: "dots", isCustom: true, lithologyClass: null, lithologyFamily });
const materials = materialsById([...DEFAULT_MATERIALS, handAdded("x-grit", "SAND"), handAdded("x-fill", "OTHER")]);
const group = (materialId: string | null, waterBearing = false) => groupOf({ materialId, waterBearing }, materials);

describe("groupOf", () => {
  it.each([
    ["clay", "clay"], ["silty_clay", "clay"], ["sandy_clay", "clay"], ["silt", "clay"],
    ["fine_sand", "fineSand"],
    ["medium_sand", "waterBearing"], ["coarse_sand", "waterBearing"], ["yellow_sand", "waterBearing"],
    ["gravel", "waterBearing"], ["sandy_gravel", "waterBearing"],
    ["kankar", "hard"], ["clay_kankar", "hard"], ["sandy_kankar", "hard"], ["rock", "hard"], ["boulder", "hard"],
  ])("%s is %s", (id, expected) => expect(group(id)).toBe(expected));

  it("covers every built-in soil type except Not recorded", () => {
    for (const m of DEFAULT_MATERIALS) expect(group(m.id) === null).toBe(m.id === "not_recorded");
  });

  it("a hand-added soil type falls back on its family", () => expect(group("x-grit")).toBe("waterBearing"));

  it("never votes: not recorded, other, unlinked, unknown id", () => {
    expect(group("not_recorded")).toBeNull();
    expect(group("x-fill")).toBeNull();
    expect(group(null)).toBeNull();
    expect(group("no-such-id")).toBeNull();
  });

  it("the driller's water-bearing tick upgrades fine sand", () => expect(group("fine_sand", true)).toBe("waterBearing"));
  it("the tick does not turn clay into water-bearing", () => expect(group("clay", true)).toBe("clay"));
  it("the tick does not turn kankar into water-bearing", () => expect(group("sandy_kankar", true)).toBe("hard"));
});
