# StrataVision Phase 5 (Section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Section screen: draw a line with bends on the map; see the ground along it from the model, with the real borewells near the line drawn solid; save it as a picture or a PDF.

**Architecture:** A pure function `sectionAlong(path, halfWidthKm, prepared, grid, borewells)` in `app/src/model/section.ts` samples the line, asks `predictColumn` at each sample, and places the borewells near the line with StrataField's `placeAlongPath`. A `SectionDrawing` SVG draws heights above sea level (so sloping ground looks right), and a `SectionView` puts the map with the line above the drawing. Saving reuses StrataField's approach: SVG → PNG on a canvas, PDF with pdf-lib, the Save dialog and file writing through Tauri's dialog and fs plugins.

**Tech Stack:** TypeScript, React, Vitest, react-leaflet; new: `pdf-lib`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs` (and their Rust crates), all already used by StrataField.

**Spec:** `docs/superpowers/specs/2026-10-13-stratavision-design.md`, "Screens → Section".

## Global Constraints

- Branch `phase-5-section` from `main`. One pull request; the owner merges. No AI attribution lines.
- The drawing's height is feet above sea level. Model columns are placed by the ground height at their sample; recorded borewells by their own ground height (the same one the model uses).
- 200 model columns along the line, whatever its length. Same strengths as the new-site column: likely 0.6, rough 0.3, none hatched. Real borewells: solid, full colour, by group, with their ID.
- Borewells within the chosen distance of the line (0.25, 0.5, 1 or 2 km; 0.5 by default), at most `MAX_SECTION_BOREWELLS`, thinned as StrataField does.
- The expected water line is drawn only where `waterHere` gives a level; it breaks elsewhere.
- Saved files are built on this computer; the picture and the PDF use fixed light colours.
- All wording in `app/src/text/index.ts`.

## Review Focus

1. Sloping ground: a model column and a borewell at the same place must line up by height. (Task 1)
2. A line with bends: distances along the line, not straight from A. (Task 1)
3. Spots with no ground height or nothing nearby: a gap, not a crash or a zero-height column. (Tasks 1–2)
4. Saving: cancelled dialog does nothing; the saved picture does not depend on the app's theme. (Task 3)

---

### Task 1: The section, as numbers

**Files:** Create `app/src/model/section.ts`, `app/src/model/section.test.ts`.

```ts
export interface SectionColumn { km: number; latitude: number; longitude: number; groundFt: number | null; steps: Step[] | null; waterFt: number | null }
export interface SectionBorewell { p: Prepared; alongKm: number; offsetKm: number }
export interface Section { lengthKm: number; columns: SectionColumn[]; borewells: SectionBorewell[]; nearby: number }
export function sectionAlong(path: LatLon[], halfWidthKm: number, prepared: Prepared[], grid: ElevationGrid, borewells: Borewell[], count = 200): Section;
```

- [ ] Tests first: samples evenly along a line with a bend, distances along the line; a flat layer between two borewells comes out at the same height on sloping ground; borewells outside the corridor left out, inside ordered along the line; no ground height → `groundFt: null, steps: null`; fewer than two points → empty section; the made-up city's section within the time limit.
- [ ] Implement; tests, typecheck, lint. Commit `Work out a section along a line`.

### Task 2: The Section screen

**Files:** Create `app/src/components/SectionDrawing.tsx`, `app/src/views/SectionView.tsx`; modify `app/src/App.tsx`, `app/src/components/SiteMap.tsx` (overlays as children), `app/src/text/index.ts`, `e2e/smoke.mjs`.

- [ ] Tab "Section". Click the map to add points (a pin adds its own position); "Undo last point", "Clear". The line, its corridor and A / A′ are drawn on the map.
- [ ] The drawing: ground line, model columns, borewell columns with IDs, dashed water line, height ruler (ft above sea level), distance along the bottom, A and A′, a key.
- [ ] Under it: "N borewells within X of the line" (and "M shown" when thinned).
- [ ] Smoke test: on the Section tab, two clicks draw a section; expect "borewells within".
- [ ] Verify in the real app with a screenshot. Commit `Draw a section along a line`.

### Task 3: Save as picture and PDF

**Files:** Create `app/src/lib/saving.ts`; modify `app/src-tauri/Cargo.toml`, `app/src-tauri/src/lib.rs`, `app/src-tauri/capabilities/default.json`, `app/package.json`.

- [ ] Picture: PNG at twice the size, light colours. PDF: one A4 landscape page with title, line length, corridor, the picture, the key in words, and the fixed line that these are proposals, not measurements.
- [ ] Verify both files open. Commit `Save a section as a picture or PDF`.

### Task 4: Review and pull request

- [ ] Fresh reviewer on the branch; fix Critical/Important with a failing test first.
- [ ] Pull request; Auto-fix on.
