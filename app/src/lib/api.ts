import { invoke } from "@tauri-apps/api/core";
import type { Borewell, PipeSegment, StrataLayer, WaterReading } from "@strata/core";

/** One borewell with everything the analysis uses, as read from StrataField's records. */
export interface SiteRecord {
  borewell: Borewell;
  strata: StrataLayer[];
  pipes: PipeSegment[];
  waterReadings: WaterReading[];
}

/** Why the records could not be read (see `LoadError` in src-tauri/src/data.rs). */
export type LoadError = { kind: "noDatabase" | "newer" | "older" } | { kind: "other"; message: string };

/** Every borewell that is not in the Recycle bin. Rejects with a `LoadError`. */
export const loadData = () => invoke<SiteRecord[]>("load_data");
