/** Made-up ground and borewells for the model's tests. Not used by the app. */
import type { Borewell, ElevationGrid, StrataLayer } from "@strata/core";
import type { ModelSite } from "./model";

/** The middle of the test area; tests ask about this point unless they say otherwise. */
export const CENTRE: [number, number] = [26.85, 80.95];

/** A latitude `km` north of the centre (negative for south). */
export const north = (km: number) => CENTRE[0] + km / 110.57;
/** A longitude `km` east of the centre (negative for west). */
export const east = (km: number) => CENTRE[1] + km / (111.32 * Math.cos((CENTRE[0] * Math.PI) / 180));

const AREA = { west: 80.7, east: 81.2, south: 26.6, north: 27.1 };

/** Ground that rises evenly from `westMetres` at the west edge to `eastMetres` at the east edge. */
export const slopeGrid = (westMetres: number, eastMetres: number): ElevationGrid =>
  ({ cols: 2, rows: 2, ...AREA, data: Int16Array.from([westMetres, eastMetres, westMetres, eastMetres], (m) => m * 10) });

export const flatGrid = (metres: number) => slopeGrid(metres, metres);

/** A borewell with the given layers, each `[top, bottom, soil type id]` or with a fourth `true` for the water-bearing tick. */
export function site(
  id: string, latitude: number | null, longitude: number | null,
  layers: [number, number, string | null, boolean?][], overrides: Partial<Borewell> = {},
): ModelSite {
  const borewell = {
    id, borewellId: id.toUpperCase(), latitude, longitude,
    locationSource: "gps", groundElevationM: null, depthUnit: "ft", recordQuality: "good",
    ...overrides,
  } as Borewell;
  const strata = layers.map(([startDepth, endDepth, materialId, waterBearing = false], i) =>
    ({ id: `${id}-${i}`, borewellId: id, startDepth, endDepth, material: materialId ?? "", materialId, color: "#000000", pattern: "dots", remarks: "", waterBearing }) as StrataLayer);
  return { borewell, strata };
}
