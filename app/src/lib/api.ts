import { invoke } from "@tauri-apps/api/core";
import type { Borewell, Material, PipeSegment, StrataLayer, WaterReading } from "@strata/core";

/** One borewell with everything the analysis uses, as read from StrataField's records. */
export interface SiteRecord {
  borewell: Borewell;
  strata: StrataLayer[];
  pipes: PipeSegment[];
  waterReadings: WaterReading[];
}

/** Everything read in one go, all as it was at the same moment. */
export interface Records {
  sites: SiteRecord[];
  /** Every soil type, built-in and added by hand; layers refer to them by id. */
  materials: Material[];
}

/** Why the records could not be read (see `LoadError` in src-tauri/src/data.rs). */
export type LoadError = { kind: "noDatabase" | "newer" | "older" } | { kind: "other"; message: string };

/** Every borewell that is not in the Recycle bin, and the soil types. Rejects with a `LoadError`. */
export const loadData = () => invoke<Records>("load_data");
