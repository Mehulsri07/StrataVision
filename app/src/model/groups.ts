/**
 * Drilling groups: the few kinds of ground that matter when drilling for water. Coarse enough for
 * logs written by different drillers to agree, fine enough to say where the water-bearing sand is.
 */
import type { LithologyClass, LithologyFamily, Material, StrataLayer } from "@strata/core";

export type Group = "clay" | "fineSand" | "waterBearing" | "hard";

/** In this order everywhere; a tied vote goes to the earlier one. */
export const GROUPS: Group[] = ["clay", "fineSand", "waterBearing", "hard"];

const BY_CLASS: Partial<Record<LithologyClass, Group>> = {
  CLAY: "clay", SILTY_CLAY: "clay", SANDY_CLAY: "clay", SILT: "clay",
  FINE_SAND: "fineSand",
  // Yellow Sand as water-bearing is an assumption to confirm with DWO.
  MEDIUM_SAND: "waterBearing", COARSE_SAND: "waterBearing", YELLOW_SAND: "waterBearing", GRAVEL: "waterBearing", SANDY_GRAVEL: "waterBearing",
  KANKAR: "hard", CLAY_KANKAR: "hard", SANDY_KANKAR: "hard", ROCK: "hard", BOULDER: "hard",
};

/** For soil types added by hand, which have a family but no class in the table above. */
const BY_FAMILY: Partial<Record<LithologyFamily, Group>> = { CLAY: "clay", SAND: "waterBearing", ROCK: "hard" };

export const materialsById = (materials: Material[]) => new Map(materials.map((m) => [m.id, m]));

/**
 * The drilling group of a layer, or null if it must not vote: "Not recorded", a soil type that is
 * neither clay, sand nor rock, or a layer whose soil name was never linked to a soil type.
 */
export function groupOf(layer: Pick<StrataLayer, "materialId" | "waterBearing">, materials: Map<string, Material>): Group | null {
  const m = layer.materialId ? materials.get(layer.materialId) : undefined;
  if (!m) return null;
  // The driller's own tick. It only ever upgrades sand: it is not filled in on every record, so an
  // unticked layer keeps its class, and a tick on clay or kankar is taken as a slip.
  if (layer.waterBearing && m.lithologyFamily === "SAND") return "waterBearing";
  return (m.lithologyClass && BY_CLASS[m.lithologyClass]) ?? (m.lithologyFamily && BY_FAMILY[m.lithologyFamily]) ?? null;
}
