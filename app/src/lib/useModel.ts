import { useEffect, useMemo, useState } from "react";
import type { ElevationGrid } from "@strata/core";
import { checkModel, type CheckResult } from "@/model/check";
import { prepare, type Prepared } from "@/model/model";
import type { Records } from "./api";
import { loadGround } from "./ground";

export interface Model {
  grid: ElevationGrid;
  /** The borewells made ready to vote. A new array whenever the records change. */
  prepared: Prepared[];
  /** How good the estimates are; null until it has been worked out for these records. */
  check: CheckResult | null;
}

/**
 * The model for the current records: null until the ground heights have loaded, "failed" if they
 * could not be read. Prepared again whenever `records` changes.
 */
export function useModel(records: Records | null): Model | "failed" | null {
  const [grid, setGrid] = useState<ElevationGrid | "failed" | null>(null);
  useEffect(() => {
    loadGround().then(setGrid, () => setGrid("failed"));
  }, []);

  const prepared = useMemo(
    () => (records && grid && grid !== "failed" ? prepare(records.sites, records.materials, grid) : null),
    [records, grid],
  );

  const [checked, setChecked] = useState<{ of: Prepared[]; result: CheckResult } | null>(null);
  useEffect(() => {
    if (!prepared || !grid || grid === "failed") return;
    // ponytail: on the main thread; well under a second at 500 borewells. Move to a Web Worker if records reach a few thousand.
    // After a pause, so the screen draws first; a result for records that have since changed is never set.
    const later = setTimeout(() => setChecked({ of: prepared, result: checkModel(prepared, grid) }), 0);
    return () => clearTimeout(later);
  }, [prepared, grid]);

  // The same object until something in it changes, so screens can tell when to work things out again.
  return useMemo(() => {
    if (grid === "failed") return "failed";
    if (!grid || !prepared) return null;
    return { grid, prepared, check: checked?.of === prepared ? checked.result : null };
  }, [grid, prepared, checked]);
}
