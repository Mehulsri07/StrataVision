# StrataVision Phase 3 (New Site and Data Quality) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Click anywhere on the map and see the proposed layers there, with how sure each is and which borewells it came from; and a Data quality screen that says in plain words how often the model is right and which borewells do not fit their surroundings.

**Architecture:** The model from phase 2 is prepared once per load in a React hook, together with the ground-height grid (StrataField's own file, bundled from the submodule). Two views in one window, switched by tabs in the header: the Map (pins, a picked spot, a side panel with a drawn column) and Data quality. Everything a user reads is produced by small pure functions that turn numbers into plain words, so the wording is tested without a browser.

**Tech Stack:** React 19, TypeScript, Leaflet via react-leaflet, inline SVG for the column, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-stratavision-design.md`, sections "Screens → Map: new site", "Screens → Data quality", "Edge cases", and phase 3 of "Phases".

## Global Constraints

- Branch `phase-3-new-site`, cut from `phase-2-model` (or `main` once #2 is merged). One pull request; the owner merges. No AI attribution lines.
- StrataField (`strata/`) is not changed.
- All wording lives in `app/src/text/index.ts`. Plain language. The screens never say "model", "confidence", "share", "vote", "weight" or "leave-one-out". The three levels are called **Likely**, **Rough guess** and **Not enough data**.
- Estimates never look measured: a proposed column is drawn faded with dashed edges, a recorded one solid. Likely steps are drawn at 0.6 opacity, rough ones at 0.3, and "not enough data" steps are left empty with a hatch.
- Group names shown to users: Clay, Fine sand, Water-bearing sand, Hard ground. Group colours: clay `#A0785A`, fine sand `#E8D5A3`, water-bearing sand `#C49A3C`, hard ground `#7A7F85`.
- The accuracy check runs on the main thread, after the screen has first drawn. This departs from the spec's "off the main thread": it measured 0.1 s on 500 borewells, so a worker is not worth its weight yet. It carries a `ponytail:` comment naming the ceiling (a few thousand borewells) and the fix (a Web Worker).
- The numbers in `model/constants.ts` are **not** tuned in this phase's code: tuning needs the real records, which are not on the development computer. The Data quality screen is the tool for it. See Task 7.
- Not in this phase: the drilling suggestion, sections, city maps, saving or printing anything.

## Review Focus

1. A spot with nothing nearby, or outside the ground-height data: the panel must say "Not enough data" plainly, with no empty drawing and no error. (Task 4)
2. Borewells with layers but no location, or with a location but no layers: the first cannot be on the map and the second has nothing to draw; neither may break the panel or the model. (Task 2, Task 4)
3. The records change while a spot is picked (Refresh or returning to the window): the panel must show the new answer for the same spot, not a stale one. (Task 4)
4. Fewer than 10 usable borewells: Data quality says it cannot judge yet and shows no percentages. (Task 5)
5. Water level: a spot far from any recent reading must not show a number. Old readings must not be mixed with recent ones, and the period used is always stated. (Task 1, Task 4)

---

### Task 1: Numbers into plain words

**Files:**
- Create: `app/src/model/words.ts`, `app/src/model/words.test.ts`
- Modify: `app/src/text/index.ts`

**Interfaces:**
- Consumes: `Group`, `GROUPS` (groups.ts); `Step`, `Source` (model.ts); `CheckResult`, `Tally`, `share` (check.ts); `estimateWater`, `waterPoints`, `recentCutoff`, `Borewell` from `@strata/core`.
- Produces:

```ts
export const GROUP_NAME: Record<Group, string>;      // "Clay", "Fine sand", "Water-bearing sand", "Hard ground"
export const GROUP_COLOUR: Record<Group, string>;
/** "Clay" · "Mostly clay, some fine sand" · "Clay or water-bearing sand" */
export function sharesInWords(shares: Record<Group, number>): string;
/** "340 m" (to the nearest 10 m) under 1 km, otherwise "1.2 km" */
export function distanceInWords(km: number): string;
/** "almost always", "about 9 times in 10", … "rarely" */
export function howOften(shareRight: number): string;
/** Runs of neighbouring steps with the same likeliest group and the same level, for drawing and listing. */
export interface Block { top: number; bottom: number; group: Group | null; level: "likely" | "rough" | "none"; steps: Step[] }
export function blocks(column: Step[]): Block[];
/** The water level to expect at a spot, or null when no recent reading is near enough to say. */
export interface WaterHere { feet: number; nearestKm: number; since: string | null }   // since: a year, e.g. "2023"
export function waterHere(latitude: number, longitude: number, borewells: Borewell[]): WaterHere | null;
```

**Rules:**
- `sharesInWords`: order groups by share, largest first (ties in `GROUPS` order). Largest ≥ 0.9 → its name. Largest ≥ 0.6 → "Mostly {largest}", then ", some {name}" for each other group with a share ≥ 0.1, in order. Otherwise → "{largest} or {second}". Names after the first word are in lower case.
- `howOften`: ≥ 0.95 "almost always"; < 0.2 "rarely"; otherwise "about " + the nearest of 9 times in 10 (0.9), 4 times in 5 (0.8), 3 times in 4 (0.75), 2 times in 3 (0.67), half the time (0.5), 1 time in 3 (0.33), 1 time in 4 (0.25).
- `blocks`: a step with `likely` null is level "none" and group null, whatever its shares.
- `waterHere`: `waterPoints(borewells)` (core's default of the last 3 years before the newest reading), then `estimateWater`. Null when there are no points or the nearest is more than `ROUGH.nearestKm` (3 km) away. `since` is the year part of `recentCutoff(borewells)`, or null when it is empty.

- [ ] **Step 1: Write `words.test.ts`**

```ts
sharesInWords({ clay: 1, fineSand: 0, waterBearing: 0, hard: 0 })            → "Clay"
sharesInWords({ clay: 0.92, fineSand: 0.08, waterBearing: 0, hard: 0 })      → "Clay"
sharesInWords({ clay: 0.25, fineSand: 0.05, waterBearing: 0.7, hard: 0 })    → "Mostly water-bearing sand, some clay"
sharesInWords({ clay: 0.15, fineSand: 0.15, waterBearing: 0.7, hard: 0 })    → "Mostly water-bearing sand, some clay, some fine sand"
sharesInWords({ clay: 0.5, fineSand: 0, waterBearing: 0.5, hard: 0 })        → "Clay or water-bearing sand"
sharesInWords({ clay: 0.3, fineSand: 0.1, waterBearing: 0.2, hard: 0.4 })    → "Hard ground or clay"
distanceInWords(0.337) → "340 m";  distanceInWords(0.004) → "0 m";  distanceInWords(0.999) → "1.0 km";  distanceInWords(1.24) → "1.2 km"
howOften(0.97) → "almost always";  0.88 → "about 9 times in 10";  0.74 → "about 3 times in 4";  0.5 → "about half the time";  0.28 → "about 1 time in 4";  0.1 → "rarely"
blocks: four steps clay/likely, clay/likely, clay/rough, none  → three blocks: 0–10 clay likely, 10–15 clay rough, 15–20 null none
blocks([]) → []
waterHere: one borewell 0.5 km away, level 60, measured 2026-03-01 → { feet: 60, nearestKm ≈ 0.5, since: "2023" }
waterHere: that borewell 4 km away → null;  no water levels at all → null
waterHere: a reading from 2015 beside a reading from 2026 → only the 2026 one counts
```

- [ ] **Step 2: Run** `npm test`. Expected: fails, module `./words` not found.
- [ ] **Step 3: Implement `words.ts`** and add the names to `text/index.ts` (`words.ts` reads them from there).
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`. Expected: all pass.
- [ ] **Step 5: Commit** — `Turn the model's numbers into plain words`

---

### Task 2: The model, ready for the screens

**Files:**
- Create: `app/src/lib/ground.ts`, `app/src/lib/useModel.ts`
- Modify: `app/src-tauri/src/data.rs` (the made-up data helper only), `app/src/vite-env.d.ts` if the `?url` import needs a type

**Interfaces:**
- Consumes: `Records` (api.ts); `prepare`, `Prepared` (model.ts); `checkModel`, `CheckResult` (check.ts); `parseElevationGrid`, `ElevationGrid` from `@strata/core`.
- Produces:

```ts
// lib/ground.ts
/** StrataField's ground-height file for Lucknow, read once. */
export function loadGround(): Promise<ElevationGrid>;

// lib/useModel.ts
export interface Model { grid: ElevationGrid; prepared: Prepared[]; check: CheckResult | null }   // check is null until worked out
/** null until the ground heights have loaded. Prepared again whenever `records` changes. */
export function useModel(records: Records | null): Model | null;
```

- [ ] **Step 1: Implement `ground.ts`.** `import url from "../../../strata/app/src/assets/lucknow-elevation.bin?url"`, `fetch`, `parseElevationGrid`; the promise is kept so the file is read once.
- [ ] **Step 2: Implement `useModel`.** `prepared` in a `useMemo` on `records` and the grid. `check` is worked out in an effect, inside a `setTimeout(…, 0)` so the screen draws first, and is cleared and worked out again when `prepared` changes; a late result for old records is ignored. Leave: `// ponytail: on the main thread; 0.1 s at 500 borewells. Move to a Web Worker if records reach a few thousand.`
- [ ] **Step 3: Make the made-up data useful for these screens.** In `seed_for_manual_runs`, each located borewell gets layers (clay from 0 to `40 + 5 × (i % 5)` ft, medium sand to 120 ft, fine sand to 160 ft, kankar to 200 ft), a water reading (`static_level` `50 + 2 × (i % 7)`, measured `2026-0{1 + i % 9}-15`), and one borewell (`i == 7`) is logged upside down so there is an odd one out. The two unlocated ones keep no layers.
- [ ] **Step 4: Run** `cargo test -p stratavision` (8 pass, 1 ignored), the seed command into a fresh folder, `cargo clippy --workspace --all-targets -- -D warnings`, `npm run typecheck`, `npm run lint`, `npm run build -w app`. Expected: all pass, and the build output contains the `.bin` file.
- [ ] **Step 5: Commit** — `Prepare the model when records load`

---

### Task 3: Drawing a column

**Files:**
- Create: `app/src/components/ColumnDrawing.tsx`

**Interfaces:**
- Consumes: `Block`, `blocks`, `GROUP_COLOUR`, `GROUP_NAME` (words.ts); `Step` (model.ts); `StrataLayer` from `@strata/core`; `text`.
- Produces:

```tsx
/** A proposed column: faded, dashed, with empty hatched stretches where there is not enough data. */
export function ProposedColumn(props: { column: Step[]; waterFt?: number | null; selected: Block | null; onSelect: (block: Block) => void }): JSX.Element;
/** A recorded column: the borewell's own layers in their own colours, solid. */
export function RecordedColumn(props: { strata: StrataLayer[]; waterFt?: number | null }): JSX.Element;   // layer depths are always feet
```

Both: an SVG 260 wide, a depth ruler on the left with a mark at every block or layer boundary (numbers left out where they would overlap), the column 90 wide, and the name of each block beside it when the block is at least 14 px tall. Scale: the column's full depth over 420 px. A blue line and "Water about N ft" at `waterFt` when given and within the column. In `ProposedColumn` each block is a button (click, or Tab and Enter) with an accessible label such as "Water-bearing sand, likely, 60 to 95 feet"; the selected block has a 2 px outline in the accent colour.

- [ ] **Step 1: Implement both components** following the constraints for opacity, dashes and hatch.
- [ ] **Step 2: Run** `npm run typecheck`, `npm run lint`. Expected: pass. (They are seen working in Task 4.)
- [ ] **Step 3: Commit** — `Draw proposed and recorded columns`

---

### Task 4: Pick a spot on the map

**Files:**
- Create: `app/src/views/MapView.tsx`
- Modify: `app/src/components/SiteMap.tsx`, `app/src/App.tsx`, `app/src/text/index.ts`

**Interfaces:**
- Consumes: `useModel`/`Model`; `predictColumn`; `waterHere`, `sharesInWords`, `distanceInWords`, `blocks`; `ProposedColumn`, `RecordedColumn`.
- Produces: `SiteMap` props become `{ sites, selectedId, picked: [number, number] | null, onSelect(id), onPick(latitude, longitude) }`; `MapView({ records, model, onHowGood })`.

**Behaviour:**
- Clicking a pin selects that borewell: the panel shows its ID, area, depth, date, its `RecordedColumn`, and the "open it in StrataField" line. Clicking the map anywhere else picks that spot, shown by a ring marker, and the panel shows **Proposed layers here**.
- Proposed panel, top to bottom: the heading; "From {n} borewells, nearest {distance}" (n is the number of different borewells across the column's sources); the water line "Water level expected about {feet} ft below ground (from levels measured since {year})" or "No recent water level nearby"; the `ProposedColumn`; a three-line key (Likely, Rough guess, Not enough data); for the selected block: its depths, `sharesInWords` of its first step, its level in words, and the borewells behind it as "{ID} · {distance}", nearest first, at most 8 then "and {k} more"; a link "How good are these estimates?" calling `onHowGood`.
- No answer: when `predictColumn` returns null, an empty column, or a column with no step other than "none", the panel shows only the heading and "There are not enough borewells near this spot to say anything." and the same link.
- While the model is not ready the panel says "Reading ground heights…".
- The column is worked out in a `useMemo` on the picked spot and `model.prepared`, so a reload shows the new answer for the same spot.

- [ ] **Step 1: Implement** the changes above.
- [ ] **Step 2: Run** `npm run typecheck`, `npm run lint`, `npm test`.
- [ ] **Step 3: Verify in the real app** on the made-up data from Task 2: start the debug build with `STRATA_DATA_DIR` on a freshly seeded folder and, through the debugging port: click the map between pins and read the panel (expect the heading, a "From … borewells" line, a water line with "since 2023", and block names including "Clay" and "Water-bearing sand"); take a screenshot and look at it; click a pin and read the recorded panel; click a far corner of the map and expect the "not enough borewells" sentence.
- [ ] **Step 4: Commit** — `Show proposed layers for any spot on the map`

---

### Task 5: Data quality

**Files:**
- Create: `app/src/views/QualityView.tsx`, `app/src/model/quality.ts`, `app/src/model/quality.test.ts`
- Modify: `app/src/App.tsx` (two tabs in the header: Map, Data quality), `app/src/text/index.ts`

**Interfaces:**
- Consumes: `CheckResult`, `share` (check.ts); `howOften` (words.ts).
- Produces:

```ts
/** The sentences the Data quality screen shows, in order. Empty when the check cannot judge. */
export function qualitySentences(check: CheckResult): string[];
```

**Sentences** (each only when its tally has at least one step):
1. "Checked against {compared} borewells: each was hidden in turn and worked out from the others."
2. "Where it says Likely, it was right {howOften}."  (`check.likely`)
3. "Where it says Rough guess, it was right {howOften}."
4. "With another borewell within 1 km, the best guess was right {howOften}."  (`check.byDistance`, which scores every step, shown or not)
5. "With the nearest borewell 1 to 3 km away, {howOften}."
6. "With the nearest borewell more than 3 km away, {howOften}."

**Screen:** heading "How good are these estimates?"; while `check` is null "Checking…"; when it cannot judge "There are not enough borewells with layers and a location to check yet (at least 10 are needed)."; otherwise the sentences, then "Borewells that do not fit their surroundings" with either "None found." or a table (ID, matched "{right} of {steps} steps", "usually {howOften} near here") and the note "These are worth a look in StrataField: most often a slip in typing or a pin in the wrong place."; and always the fixed line "These are proposals worked out from past drilling. They are not measurements."

- [ ] **Step 1: Write `quality.test.ts`:** a result (`overall` is likely and rough together and is not shown on its own) with likely 90/100, rough 60/100, under1 95/100, from1to3 0/0, over3 1/4, compared 40 gives sentences 1, 2 ("about 9 times in 10"), 3 ("about 2 times in 3"), 4 ("almost always"), 6 ("about 1 time in 4") and not 5; `canJudge: false` gives `[]`.
- [ ] **Step 2: Run** `npm test`. Expected: fails, module not found.
- [ ] **Step 3: Implement** `quality.ts`, `QualityView`, the tabs, and wire `onHowGood` to switch to it.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`. **Verify in the real app** on the seeded data: the Data quality tab shows the sentences and lists the upside-down borewell (`BW-008`); on a folder seeded with fewer than 10 the "not enough borewells" sentence. Take a screenshot and look at it.
- [ ] **Step 5: Commit** — `Add the Data quality screen`

---

### Task 6: The real app, end to end

**Files:**
- Modify: `e2e/smoke.mjs`

- [ ] **Step 1: Add a second scenario** after the existing one: seed a fresh temporary folder by running `cargo test -p stratavision seed_for_manual_runs -- --ignored` with `STRATA_SEED_DIR`; start the app on it; wait for "25 borewells on the map"; click the middle of the map a little off the centre pin; pass when the panel contains "Proposed layers here" and "Clay"; then open the Data quality tab and pass when it contains "Checked against". Remove the folder afterwards. Each scenario reports its own failure with the screen's text.
- [ ] **Step 2: Run** the debug build and `npm run smoke`. Expected: both scenarios OK. Break one expected string on purpose, confirm it fails with the screen text, restore it.
- [ ] **Step 3: Commit** — `Test picking a spot in the real app`

---

### Task 7: Pull request, and what tuning needs

- [ ] **Step 1: Run everything:** `npm test`, `npm run typecheck`, `npm run lint`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, the debug build, `npm run smoke`.
- [ ] **Step 2: Push and open the pull request**, with screenshots of the proposed-layers panel and the Data quality screen described in words. Turn Auto-fix on. The owner merges.
- [ ] **Step 3: Tell the owner what tuning needs.** The constants are still the starting values. To tune them: run this build on the computer with the real records (or bring a copy of `%APPDATA%\Strata\strata.db` here), open Data quality, and send back what it says. The aim from the spec is "Likely" right at least 7 times in 10.
