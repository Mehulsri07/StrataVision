import { parseElevationGrid, type ElevationGrid } from "@strata/core";
// StrataField's own ground-height file for Lucknow, bundled from the submodule so both apps agree.
import url from "../../../strata/app/src/assets/lucknow-elevation.bin?url";

let ground: Promise<ElevationGrid> | null = null;

/** Ground heights above sea level around Lucknow. The file is read once. */
export function loadGround(): Promise<ElevationGrid> {
  ground ??= fetch(url).then((r) => {
    if (!r.ok) throw new Error(`ground heights: ${r.status}`);
    return r.arrayBuffer();
  }).then(parseElevationGrid);
  // A failed read is not kept, so Refresh can try again.
  ground.catch(() => (ground = null));
  return ground;
}
