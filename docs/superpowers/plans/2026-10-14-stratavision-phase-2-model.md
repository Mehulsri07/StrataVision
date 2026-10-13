# StrataVision Phase 2 (Model) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The calculation that says, for any point and depth in the city, what the ground probably is and how sure that is, plus the check that measures how often it is right. No screens.

**Architecture:** Pure TypeScript in `app/src/model/`, tested with Vitest. Borewells are prepared once per load (each layer turned into a height range and a drilling group); `predictColumn` then answers for one point by a weighted vote of nearby prepared borewells, and `checkModel` hides each borewell in turn and scores the prediction against it. One small Rust change sends the soil-type list with the records, because hand-added soil types are only known to the database.

**Tech Stack:** TypeScript ~7.0.2, Vitest ^5.0.2 (the version StrataField's `core` uses), `@strata/core` for types, ground heights and distances. Rust only in Task 1.

**Spec:** `docs/superpowers/specs/2026-10-13-stratavision-design.md`, section "The model" (drilling groups, question answered, how the vote works, accuracy check, speed) and the model lines of "Testing".

## Global Constraints

- Branch `phase-2-model`, cut from `phase-1-skeleton` if pull request #1 is not merged yet, otherwise from `main`. One pull request; the owner merges. No AI attribution lines.
- StrataField (`strata/`) is not changed.
- Depths and heights inside the model are in **feet**. Height above sea level of a depth = ground height in metres × `METRES_TO_FEET` − depth in feet. A borewell whose `depthUnit` is `'m'` has its layer depths multiplied by `METRES_TO_FEET` first.
- Ground height of a borewell: its own `groundElevationM` when not null, otherwise `heightAt(grid, latitude, longitude)`. Ground height of an asked point: `heightAt` only.
- Every number below is a named export of `app/src/model/constants.ts`, with exactly these values: `STEP_FT = 5`, `RADIUS_KM = 5`, `MAX_VOTERS = 12`, `MIN_DISTANCE_KM = 0.025`, `SAME_SITE_KM = 0.1`, `QUALITY_WEIGHT = { good: 1, fair: 0.7, unknown: 0.7, poor: 0.4 }`, `ADDRESS_WEIGHT = 0.5`, `LIKELY = { nearestKm: 1, sites: 3, share: 0.6 }`, `ROUGH = { nearestKm: 3, sites: 2 }`, `MIN_BOREWELLS_TO_JUDGE = 10`, `ODD = { fraction: 0.5, minSteps: 10 }`.
- The model never invents data: no voter means no answer; a "Not recorded" layer, a gap, or a layer with no soil type linked never votes.
- Not in this phase: screens, running the check off the main thread, the real elevation file (tests build small grids by hand), tuning the constants against real records (phase 3).

## Review Focus

1. Many borewells at one spot (the real records have plenty): they must count as one site for confidence and share one vote, and must not crowd every other site out of an answer. (Task 3; the 12-voter limit is the known weak point and has its own test.)
2. A borewell much shallower than its neighbours: below its bottom it must stop voting, not vote its last layer downwards. (Task 3)
3. A point outside the ground-height grid, or a borewell there with no recorded ground height: no answer and no crash. (Task 3)
4. A borewell logged in metres among borewells logged in feet. (Task 3)
5. The check on very few borewells, or on borewells that are all far apart, must say it cannot judge instead of reporting 0% or dividing by zero. (Task 4)

---

### Task 1: Send the soil-type list with the records

**Files:**
- Modify: `app/src-tauri/src/data.rs`, `app/src-tauri/src/lib.rs`, `app/src/lib/api.ts`, `app/src/App.tsx`

**Interfaces:**
- Produces (Rust): `pub struct Records { pub sites: Vec<SiteRecord>, pub materials: Vec<Material> }` (camelCase), `pub fn load(data_dir: &Path) -> Result<Records, LoadError>`; command `load_data` returns it.
- Produces (TypeScript): `export interface Records { sites: SiteRecord[]; materials: Material[] }`, `loadData(): Promise<Records>`.

- [ ] **Step 1: Change the tests first.** In `data.rs` every `load(...).unwrap()` that reads sites now reads `.sites`; add to `loads_after_a_clean_close`:

```rust
let records = load(tmp.path()).unwrap();
assert!(records.materials.iter().any(|m| m.id == "clay" && m.lithology_class.as_deref() == Some("CLAY")));
```

- [ ] **Step 2: Run** `cargo test -p stratavision`. Expected: does not compile (`Records` not defined, no field `sites`).
- [ ] **Step 3: Implement.** `load` reads `strata_db::repo::materials::list(&tx)` inside the same transaction as the borewells and returns `Records`. Update `lib.rs`, `api.ts` and `App.tsx` (state holds `Records`; the screen behaves as before).
- [ ] **Step 4: Run** `cargo test -p stratavision`, `cargo clippy --workspace --all-targets -- -D warnings`, `npm run typecheck`, `npm run lint`, then the debug build and `npm run smoke`. Expected: 8 tests pass, the rest clean, smoke OK.
- [ ] **Step 5: Commit** — `Send the soil-type list with the records`

---

### Task 2: Drilling groups, and a test runner

**Files:**
- Create: `app/src/model/constants.ts`, `app/src/model/groups.ts`, `app/src/model/groups.test.ts`
- Modify: `app/package.json` (dev dependency `vitest ^5.0.2`, script `"test": "vitest run"`), root `package.json` (script `"test": "npm test -w app"`), `.github/workflows/ci.yml` (a `Test` step running `npm test` in the `check` job, after Lint)

**Interfaces:**
- Produces:

```ts
export type Group = "clay" | "fineSand" | "waterBearing" | "hard";
export const GROUPS: Group[];   // in that order; ties in a vote go to the earlier one
/** The drilling group of a layer, or null if it must not vote. */
export function groupOf(layer: Pick<StrataLayer, "materialId" | "waterBearing">, materials: Map<string, Material>): Group | null;
export const materialsById: (materials: Material[]) => Map<string, Material>;
```

- [ ] **Step 1: Write `groups.test.ts`.** `materials` is `materialsById(DEFAULT_MATERIALS)` from `@strata/core` plus one hand-added soil type `{ id: "x-grit", lithologyClass: null, lithologyFamily: "SAND" }` and one `{ id: "x-fill", lithologyClass: null, lithologyFamily: "OTHER" }`.

```ts
it.each([
  ["clay", "clay"], ["silty_clay", "clay"], ["sandy_clay", "clay"], ["silt", "clay"],
  ["fine_sand", "fineSand"],
  ["medium_sand", "waterBearing"], ["coarse_sand", "waterBearing"], ["yellow_sand", "waterBearing"],
  ["gravel", "waterBearing"], ["sandy_gravel", "waterBearing"],
  ["kankar", "hard"], ["clay_kankar", "hard"], ["sandy_kankar", "hard"], ["rock", "hard"], ["boulder", "hard"],
])("%s is %s", (id, group) => expect(groupOf({ materialId: id, waterBearing: false }, materials)).toBe(group));

it("a hand-added soil type falls back on its family", …"x-grit" → "waterBearing");
it("never votes: not recorded, other, unlinked, unknown id", …"not_recorded", "x-fill", null, "no-such-id" → null);
it("the driller's water-bearing tick upgrades fine sand", …{ materialId: "fine_sand", waterBearing: true } → "waterBearing");
it("the tick does not turn clay into water-bearing", …{ materialId: "clay", waterBearing: true } → "clay");
it("the tick does not turn kankar into water-bearing", …{ materialId: "sandy_kankar", waterBearing: true } → "hard");
```

- [ ] **Step 2: Run** `npm test`. Expected: fails, `groupOf` not found.
- [ ] **Step 3: Implement `constants.ts` and `groups.ts`.** Class table as in the spec. Family fallback when the class is null or not in the table: CLAY → clay, SAND → waterBearing, ROCK → hard, anything else → null. The tick upgrades only when the soil type's family is SAND.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`. Expected: all pass.
- [ ] **Step 5: Commit** — `Add drilling groups`

---

### Task 3: The vote

**Files:**
- Create: `app/src/model/model.ts`, `app/src/model/model.test.ts`, `app/src/model/testGround.ts` (test helpers only)

**Interfaces:**
- Consumes: `Group`, `GROUPS`, `groupOf`, `materialsById`, the constants; from `@strata/core`: `Borewell`, `StrataLayer`, `Material`, `ElevationGrid`, `heightAt`, `kmBetween`, `METRES_TO_FEET`.
- Produces:

```ts
export interface ModelSite { borewell: Borewell; strata: StrataLayer[] }

/** One borewell made ready to vote. */
export interface Prepared {
  id: string; borewellId: string;
  latitude: number; longitude: number;
  groundFt: number;                 // height above sea level
  weight: number;                   // record quality × location source
  runs: { topFt: number; bottomFt: number; group: Group }[];   // heights above sea level, top first
}
/** Leaves out borewells with no location, no ground height, or no layer that can vote. */
export function prepare(sites: ModelSite[], materials: Material[], grid: ElevationGrid): Prepared[];

export type Confidence = "likely" | "rough" | "none";
export interface Source { id: string; borewellId: string; km: number; weight: number }
export interface Step {
  top: number; bottom: number;      // feet below ground at the asked point
  shares: Record<Group, number> | null;   // adds up to 1; null when nobody voted
  likely: Group | null;             // null when confidence is "none"
  confidence: Confidence;
  sources: Source[];                // nearest first
}
/** null when the ground height at the point is unknown. `exclude` and `groundM` are for the accuracy check. */
export function predictColumn(latitude: number, longitude: number, prepared: Prepared[], grid: ElevationGrid,
  options?: { exclude?: string; groundM?: number }): Step[] | null;
```

- Produces (test helpers, `testGround.ts`): `flatGrid(metres: number): ElevationGrid` covering latitude 26.6 to 27.1, longitude 80.7 to 81.2; `slopeGrid(westMetres, eastMetres)`; `site(id, latitude, longitude, layers: [top, bottom, materialId][], overrides?: Partial<Borewell>): ModelSite`; `east(km)` and `north(km)` giving a longitude or latitude that far from `[26.85, 80.95]`.

**The rules** (`predictColumn`), in order:

1. Ground at the point: `options.groundM`, else `heightAt`; null → return null.
2. Candidates: prepared borewells other than `exclude`, within `RADIUS_KM`, sorted nearest first. None → return `[]`.
3. The column runs from 0 down to the deepest candidate's bottom, in the point's own depths, rounded up to a whole step.
4. For each step, the voters are the first `MAX_VOTERS` candidates that have a run covering the height of the step's middle.
5. Each voter's weight is `prepared.weight / max(km, MIN_DISTANCE_KM)² / crowd`, where `crowd` is the number of that step's voters within `SAME_SITE_KM` of it, itself included.
6. `shares` are the weights by group divided by their total.
7. Sites: walk the voters nearest first; a voter starts a new site unless it is within `SAME_SITE_KM` of the first voter of an existing site.
8. Confidence: `likely` if nearest voter ≤ `LIKELY.nearestKm` and sites ≥ `LIKELY.sites` and largest share ≥ `LIKELY.share`; else `rough` if nearest ≤ `ROUGH.nearestKm` and sites ≥ `ROUGH.sites`; else `none`.

- [ ] **Step 1: Write `model.test.ts`.** All on `flatGrid(120)` unless stated; "the point" is `[26.85, 80.95]`. `stepAt(column, depthFt)` returns the step containing that depth.

```ts
it("recovers a flat layer between borewells", …
  // three borewells 0.5 km away to the north, east and south-west, each clay 0–50, sand 50–100
  // stepAt(col, 20).likely === "clay"; stepAt(col, 70).likely === "waterBearing"; both "likely"; col.length === 20
);
it("names the borewells behind a step, nearest first", …sources ids in distance order, km within 0.01);
it("stops a shallow borewell voting below its bottom", …
  // two deep clay borewells 0.5 km away (0–200), one borewell 0.1 km away sand 0–50 only
  // stepAt(col, 20).likely === "waterBearing"; stepAt(col, 120).shares.clay === 1; its sources do not include the shallow one
);
it("a crowded site shares one vote", …
  // ten clay borewells within 30 m of each other 1 km east; one sand borewell 1 km west
  // stepAt(col, 20).shares.clay is within 0.05 of 0.5
);
it("a crowded site is one site for confidence", …
  // the same ten alone: confidence "none" (one site), likely null, shares.clay === 1
);
it("ponytail limit: more than 12 borewells at the nearest spot leave room for nobody else", …
  // thirteen clay borewells within 30 m, 0.2 km away; one sand borewell 0.5 km away
  // documents today's behaviour: sources.length === 12, shares.waterBearing === 0, confidence "none"
);
it("matches layers by height, not depth, on sloping ground", …
  // slopeGrid(110, 130). Sand lies between 250 and 300 ft above sea level in borewells west and east of the point.
  // At the point the sand step is at the depth that height corresponds to there, not at either borewell's depth.
);
it("uses a borewell's own recorded ground height before the grid", …groundElevationM: 130 on flatGrid(120) shifts its layers by 10 m);
it("confidence falls with distance", …three agreeing borewells at 0.5 km → "likely"; at 2 km → "rough"; at 4 km → "none");
it("confidence falls with disagreement", …three sites at 0.5 km, shares 0.5/0.5 → "rough");
it("counts poor records and address-located borewells less", …
  // good clay at 1 km vs poor sand at 1 km → shares.clay ≈ 1/1.4; same with locationSource "address" → ≈ 1/1.5
);
it("converts borewells logged in metres", …depthUnit "m", clay 0–10 m → clay down to 30 ft, nothing at 40 ft);
it("not recorded and gaps never vote", …a "not_recorded" layer 0–50 and a gap 50–60: steps there have shares null when it is the only borewell);
it("gives no answer outside the ground-height grid", …predictColumn(28, 80.95, …) === null);
it("leaves out borewells it cannot place", …prepare drops: no latitude; outside the grid with no groundElevationM; only not-recorded layers);
it("gives an empty column with no borewell within 5 km", …[]);
it("exclude hides a borewell from its own prediction", …);
```

- [ ] **Step 2: Run** `npm test`. Expected: fails, `predictColumn` not found.
- [ ] **Step 3: Implement `testGround.ts`, then `prepare` and `predictColumn` in `model.ts`** following the rules above. Leave this comment on the voter limit: `// ponytail: the 12 nearest borewells, not sites; a spot with 12 or more logs crowds out everyone else. Limit by site if real records show it.`
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`. Expected: all pass.
- [ ] **Step 5: Commit** — `Add the weighted vote`

---

### Task 4: The accuracy check and odd ones out

**Files:**
- Create: `app/src/model/check.ts`, `app/src/model/check.test.ts`

**Interfaces:**
- Consumes: `Prepared`, `predictColumn`, `Step` from Task 3; `median` from `@strata/core`.
- Produces:

```ts
export interface Tally { steps: number; right: number }
export interface OddOne { id: string; borewellId: string; steps: number; right: number; typical: number }
export interface CheckResult {
  canJudge: boolean;                // at least MIN_BOREWELLS_TO_JUDGE borewells were compared
  compared: number;                 // borewells with at least one comparable step
  overall: Tally; likely: Tally; rough: Tally;
  byDistance: { under1: Tally; from1to3: Tally; over3: Tally };   // by distance to the nearest other borewell
  oddOnesOut: OddOne[];             // worst first
}
export function checkModel(prepared: Prepared[], grid: ElevationGrid): CheckResult;
export const share = (t: Tally) => (t.steps === 0 ? null : t.right / t.steps);
```

**The rules:**

1. For each prepared borewell, `predictColumn` at its own place with `exclude` its id and `groundM` its own ground height.
2. A step is comparable when the prediction's `likely` is not null and the hidden borewell has a run covering the step's middle. It is right when the two groups are the same.
3. Every comparable step is added to `overall`, to `likely` or `rough` by its confidence, and to the band of its borewell.
4. Odd ones out: among borewells with at least `ODD.minSteps` comparable steps, `typical` is the median of their own right-fractions within their band; a borewell is odd when its right-fraction is below `ODD.fraction × typical`. Sorted by right-fraction, lowest first.

- [ ] **Step 1: Write `check.test.ts`**

```ts
it("scores a uniform city as always right", …
  // 16 borewells on a 4 × 4 grid 0.5 km apart, all clay 0–50, sand 50–100
  // canJudge true; share(overall) === 1; oddOnesOut empty; byDistance.under1.steps === overall.steps
);
it("finds a borewell that does not fit its surroundings", …
  // the same city with one borewell logged upside down (sand 0–50, clay 50–100)
  // oddOnesOut[0].borewellId is that one; oddOnesOut.length === 1; share(overall) < 1
);
it("cannot judge on fewer than ten borewells", …9 borewells → canJudge false, oddOnesOut empty);
it("does not divide by zero when nothing is comparable", …
  // 12 borewells each more than 5 km from every other: compared === 0, canJudge false, share(overall) === null
);
it("puts borewells in the band of their nearest neighbour", …pairs 0.5 km, 2 km and 4 km apart land in under1, from1to3, over3);
```

- [ ] **Step 2: Run** `npm test`. Expected: fails, `checkModel` not found.
- [ ] **Step 3: Implement `check.ts`** following the rules.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`. Expected: all pass.
- [ ] **Step 5: Commit** — `Add the accuracy check and odd ones out`

---

### Task 5: A made-up city of 500 borewells

Proves the model on ground whose true answer is known, at the real size and with the real overlap, inside time limits.

**Files:**
- Create: `app/src/model/madeUpCity.ts` (test helper), `app/src/model/city.test.ts`

**Interfaces:**
- Produces (test helper):

```ts
/** What the made-up ground really is at a place and a height above sea level, in feet. */
export function truth(latitude: number, longitude: number, heightFt: number): Group;
/** `count` borewells logged from `truth`, always the same for the same seed. */
export function madeUpCity(count: number, seed?: number): { sites: ModelSite[]; grid: ElevationGrid };
```

**The made-up ground:** `slopeGrid(110, 125)`. Going down by height above sea level: clay, then water-bearing sand, then fine sand, then hard, then water-bearing sand to the bottom. The four boundaries start at 330, 280, 250 and 220 ft above sea level and each moves up and down by 15 ft across the city as a smooth wave about 8 km long, each with a different direction. Borewells: a small seeded random-number function (no dependency); 70% spread evenly over latitude 26.75 to 26.95, longitude 80.85 to 81.05; 30% placed within 50 m of an earlier one; depth between 150 and 400 ft; layers read from `truth` every 5 ft and merged; record quality `good`.

- [ ] **Step 1: Write `city.test.ts`**

```ts
const { sites, grid } = madeUpCity(500);
const prepared = prepare(sites, DEFAULT_MATERIALS, grid);

it("is right at least 7 times in 10 where it says likely", …
  const r = checkModel(prepared, grid);
  // r.canJudge; share(r.likely) >= 0.7; share(r.likely) > share(r.rough); r.likely.steps > r.overall.steps * 0.5
);
it("flags few honest borewells as odd", …r.oddOnesOut.length <= 10);
it("gets better with more borewells", …share(checkModel of madeUpCity(100)).overall) < share(checkModel of madeUpCity(500)).overall));
it("agrees with the truth at a place nobody drilled", …
  // predictColumn at [26.87, 80.97]: of its "likely" steps, at least 70% equal truth at that step's middle
);
it("is fast enough", …
  // one column < 20 ms; 200 columns along a line < 1 s; 100 × 100 points at one depth (whole columns) < 5 s;
  // checkModel(prepared, grid) < 5 s. Each measured with performance.now(); the test's own timeout is 30 s.
);
```

- [ ] **Step 2: Run** `npm test`. Expected: fails, `madeUpCity` not found.
- [ ] **Step 3: Implement `madeUpCity.ts`.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass. If an accuracy or time assertion fails, the model is what needs to change, using superpowers:systematic-debugging; the thresholds come from the spec and stay.
- [ ] **Step 5: Run** `npm run typecheck`, `npm run lint`. **Commit** — `Prove the model on a made-up city of 500 borewells`

---

### Task 6: Pull request

- [ ] **Step 1: Run everything:** `npm test`, `npm run typecheck`, `npm run lint`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, the debug build, `npm run smoke`. Expected: all pass.
- [ ] **Step 2: Push `phase-2-model` and open the pull request** into `main` (or into `phase-1-skeleton` if #1 is still open, saying so). Report the made-up city's numbers in the description: share right for likely and rough steps, by distance band, and the four timings. Turn Auto-fix on. The owner merges.
