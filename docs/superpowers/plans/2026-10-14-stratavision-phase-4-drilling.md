# StrataVision Phase 4 (Drilling Suggestion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Under the proposed column for a picked spot, a drilling suggestion in two halves shown together: what was done at the nearest sites, and what the records suggest (water level, where to put slotted pipe, how deep to drill).

**Architecture:** Two pure functions in `app/src/model/drilling.ts`: `nearbyWells` gathers the nearest sites' depths, pumps and slotted pipe (moved into the picked spot's depths by height above sea level), and `suggestDrilling(column, water, nearby)` reads the model's column and does not change it. The Map panel shows both; the drawing shows nearby slotted pipe beside the column.

**Tech Stack:** TypeScript, React, Vitest; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-stratavision-design.md`, "Screens → Map: drilling suggestion".

## Global Constraints

- Branch `phase-4-drilling` from `main`. One pull request; the owner merges. No AI attribution lines.
- Nearby: the 5 nearest **sites** within 3 km (`ROUGH.nearestKm`), borewells within `SAME_SITE_KM` of each other being one site, represented by its nearest borewell.
- Depths below ground are feet. A borewell's `totalDepth` is metres when its `depthUnit` is `"m"` and is converted; pipe depths and `pumpLowering` are always feet.
- Slotted pipe proposed: each run of steps whose likeliest group is water-bearing, at least 10 ft thick, entirely below the expected water level, and `likely` or `rough`; a run carries the weaker level of its steps.
- How deep to drill: the bottom of the lowest such run, never deeper than the deepest borewell among the nearby sites. This rule is an assumption to confirm with DWO, and the screen says the driller decides.
- No such run, or no expected water level: the screen says so and shows only what was done nearby. No nearby sites: no suggestion.
- All wording in `app/src/text/index.ts`.

## Review Focus

1. A nearby borewell on higher or lower ground: its slotted pipe must be drawn at the same height, not the same depth. (Task 1)
2. Several borewells at one site must count as one of the 5 sites. (Task 1)
3. Old records in metres: total depth converted, pipes and pump not. (Task 1)
4. A run of water-bearing sand that starts above the water level: only the part below can be proposed, and only if that part is at least 10 ft. (Task 1)
5. No pump or depth recorded anywhere nearby: those lines are left out, not shown as zero. (Task 2)

---

### Task 1: The suggestion, as numbers

**Files:** Create `app/src/model/drilling.ts`, `app/src/model/drilling.test.ts`.

**Interfaces:**

```ts
export interface Span { top: number; bottom: number }
export interface NearbyWell { id: string; borewellId: string; km: number; drilledFt: number | null; pumpFt: number | null; slotted: Span[] /* in the picked spot's depths */ }
export interface Spread { low: number; middle: number; high: number }
export interface Suggestion {
  nearby: NearbyWell[];
  drilled: Spread | null;
  pump: Spread | null;
  /** What the records suggest; null with the reason when nothing can be proposed. */
  proposal: { waterFt: number; slotted: (Span & { level: "likely" | "rough" })[]; drillToFt: number } | null;
  noProposal: "noWater" | "noWaterBearing" | null;
}
export function nearbyWells(latitude: number, longitude: number, sites: SiteWithPipes[], grid: ElevationGrid): NearbyWell[];
export function suggestDrilling(column: readonly Step[], water: WaterHere | null, nearby: NearbyWell[]): Suggestion | null;
```

- [ ] Tests first (each fails before the code exists): nearest 5 sites within 3 km, a crowded site once; slotted pipe moved by height on sloping ground; metres total depth converted; spreads (low, middle, high) and null when nothing recorded; slotted proposed only below the water level and only in runs of 10 ft or more, carrying the weaker level; a run straddling the water level is cut at it; depth capped at the deepest nearby borewell; no water → `noWater`; no run → `noWaterBearing`; no nearby → null.
- [ ] Implement; `npm test`, typecheck, lint. Commit `Work out a drilling suggestion`.

### Task 2: On the Map panel

**Files:** Modify `app/src/views/MapView.tsx`, `app/src/components/ColumnDrawing.tsx`, `app/src/text/index.ts`, `app/src-tauri/src/data.rs` (made-up data: slotted pipe and pump), `e2e/smoke.mjs`.

- [ ] Under the column: heading "Drilling suggestion" and "From past drilling nearby. The driller decides."; **What was done nearby**: drilled depth spread, pump depth spread, each nearby borewell with its distance; **What the records suggest**: water level, slotted pipe stretches with their level, how deep to drill with "(at most as deep as the deepest borewell nearby)", or the reason there is no proposal. Lines with nothing recorded are left out.
- [ ] The drawing shows each nearby borewell's slotted pipe as a thin blue line beside the column, at its height, and the proposed slotted stretches as dashed blue brackets; the key explains both.
- [ ] Made-up data: every located borewell gets slotted pipe 60–120 ft and a pump at 100–130 ft. The real-app test expects "Drilling suggestion" and "How deep to drill".
- [ ] Verify in the real app with a screenshot. Commit `Show the drilling suggestion`.

### Task 3: Review and pull request

- [ ] Fresh reviewer on the branch; fix Critical/Important with a failing test first.
- [ ] Pull request with screenshots described; Auto-fix on.
