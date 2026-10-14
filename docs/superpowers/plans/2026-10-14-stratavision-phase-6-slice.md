# StrataVision Phase 6 (3D Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Section screen, a "3D slice" view: the drawn section with a chosen depth behind it, shown as a block cut out of the ground that can be turned and tilted.

**Architecture:** A pure `sliceAlong(path, corridorKm, depthKm, prepared, grid, borewells)` in `app/src/model/slice.ts` makes every side as an ordinary `Section`: the front is the section itself (as on the flat drawing), the back is a cut parallel to it `depthKm` behind (to the left walking A to A′), and the two ends are cuts across. Positions are km east and north of A. The drawing part of `SectionDrawing` is split out (`SectionPlot`) so every side is drawn the same way at one shared scale. `SliceView` places each side as a flat SVG panel with CSS 3D transforms; outward-facing panels only (`backface-visibility: hidden`), so the inside is never shown.

**Tech Stack:** TypeScript, React, CSS 3D transforms. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-stratavision-design.md`, "Phases → 6. 3D slice".

## Global Constraints

- Branch `phase-6-slice` from `main`. One pull request; the owner merges. No AI attribution lines.
- One flat side per straight part of the line. The back follows the line at a fixed distance, with mitred corners (a corner never reaches more than 3 depths out).
- The top is the strip of ground between the front and the back: plain land colour, the line along its front edge, and pins for the borewells inside the strip, with their IDs. No map tiles.
- Back and end faces show borewells within 50 m of that cut; the front shows the same borewells as the flat drawing.
- All sides share one height range and one scale. Heights are stretched; a control sets how much (5× to 100×, 25× to start).
- Turn by dragging sideways, tilt by dragging up and down; arrow keys do the same; "Reset view". Depth behind: 250 m, 500 m, 1 km or 2 km (500 m to start).
- All wording in `app/src/text/index.ts`.

## Review Focus

1. Each side faces outward and reads left to right from outside; the inside is never seen. (Task 2)
2. Bends: the back is offset correctly to the left, corners join without crossing. (Task 1)
3. All sides at the same height scale, so layers meet at the block's edges. (Tasks 1–2)

---

### Task 1: The slice, as numbers

**Files:** Create `app/src/model/slice.ts`, `app/src/model/slice.test.ts`; modify `app/src/model/section.ts` (export the repeated-point rule).

- [ ] Tests first: `offsetPath` moves a straight line to its left; at a right-angle bend the corner is mitred; a sharp turn is capped. `sliceAlong`: a bent line gives 2 fronts, 2 backs and 2 ends; the back of a line is drawn from A′ to A; borewells inside the strip are pins, those on the other side of the line are not; one shared height range.
- [ ] Implement; tests, typecheck, lint. Commit `Work out a slice behind a section`.

### Task 2: The 3D view

**Files:** Modify `app/src/components/SectionDrawing.tsx` (split out `SectionPlot`, `heightRange`); create `app/src/components/SliceView.tsx`; modify `app/src/views/SectionView.tsx`, `app/src/text/index.ts`, `e2e/smoke.mjs`.

- [ ] "Flat drawing" / "3D slice" switch above the drawing; depth, stretch, reset; drag and arrow keys.
- [ ] Smoke test: switch to 3D slice, expect "Drag to turn".
- [ ] Verify in the real app with screenshots from two angles. Commit `Show a section as a 3D slice`.

### Task 3: Review and pull request

- [ ] Fresh reviewer on the branch; fix Critical/Important with a failing test first.
- [ ] Pull request; Auto-fix on.
