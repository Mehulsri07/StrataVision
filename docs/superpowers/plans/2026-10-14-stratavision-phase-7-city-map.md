# StrataVision Phase 7 (City Map) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A City map screen: the model painted over the whole city in three modes — the ground at a chosen depth, the depth to water-bearing sand, and where data is thin.

**Architecture:** `app/src/model/cityMap.ts`: `cityPoint` asks `predictColumn` at one point and keeps only what the modes need (a code per 5 ft step, the first water-bearing sand ≥ 10 ft); `cityArea` is the borewells' extent plus 2 km; `paint` turns a grid of points into RGBA pixels for a mode. `CityView` works the 100 × 100 grid out in small batches (the screen stays responsive, with progress), paints it on a canvas and lays it on the map as an image overlay.

**Tech Stack:** TypeScript, React, react-leaflet `ImageOverlay`, canvas. No new dependencies.

**Spec:** "Screens → City map".

## Global Constraints

- Branch `phase-7-city-map` from `main`; one pull request; no AI attribution lines.
- 100 × 100 points over the borewells' extent plus 2 km. Worked out once per set of records, only after the screen is first opened.
- Every mode: strong where likely, pale where a rough guess, nothing where there is not enough data.
- Depth slider in 5 ft steps, to the deepest step anywhere on the map.
- A key for each mode. All wording in `app/src/text/index.ts`.

## Tasks

1. [ ] `cityMap.ts` with tests (codes and levels; first water-bearing sand ≥ 10 ft; unknown ground; area margin; painting per mode with paler rough and empty none). Commit `Work out the city map`.
2. [ ] `CityView` tab "City map": mode switch, depth slider, key, progress; overlay pixelated. Smoke test opens it and expects the key. Screenshot each mode. Commit `Show the city map`.
3. [ ] Fresh reviewer; fix Critical/Important with a failing test first; pull request.
