# StrataVision design

Date: 2026-10-13. Status: approved.

## Purpose

StrataVision builds a **proposed lithological model of the whole of Lucknow** from the borewells
recorded in StrataField, and lets DWO look at it three ways: down a single point, along any line, and
across the city. The model is recalculated from the data every time, so it improves by itself as
borewells are added.

It is for DWO's own use: deciding what to expect before drilling, and understanding the ground
under the city. Users are not technical.

Success means:

- Any point in the city gives either a proposed column with a stated confidence, or an honest
  "not enough data".
- A cross-section can be drawn anywhere, not only between neighbouring borewells.
- One plain accuracy figure exists, measured on the real data, and it goes up as data is added.
- No estimate can be mistaken for a measurement, and every estimate can name the borewells behind it.

## Decisions made

| Question | Decision |
|---|---|
| What is it | One model, several views of it |
| Detail level | Four drilling groups (below), not every soil type |
| Method | Weighted vote of nearby borewells, depth by depth |
| Where it runs | A separate desktop app, in its own repository |
| Data | The same `strata.db` as StrataField, opened read-only |
| Planned later | Thickness and water-trend maps |
| 3D | A section shown as a turnable slice of ground, built from flat section drawings |
| Left out | Fence diagram, whole-city 3D block, hand-correcting the model, customer report, yield in litres, forecasts |

This replaces the README roadmap line that says StrataVision begins as screens inside StrataField.

## Repository and shared code

- New repository `Mehulsri07/StrataVision`. Same stack as StrataField: Tauri 2, React, TypeScript,
  shadcn/ui, Leaflet, Rust shell. Windows only.
- StrataField is included as a **git submodule at `strata/`, pinned to a release tag**.
  `@strata/core` (npm workspace path `strata/core`) and the `strata_db` crate (Cargo path
  `strata/core/db`) are used directly from it. Moving to a newer StrataField is a PR that changes the
  pin.
- From `core/` StrataVision uses only what both apps share: data types, soil classes
  (`materials.json`, `familyOf`), ground heights (`elevation.ts`), water estimates (`waterMap.ts`)
  and placing borewells along a line (`placeAlongPath`).
- **The model lives in StrataVision** (`src/model/`), not in StrataField's `core/`, because
  StrataField does not use it.
- Screens and drawings are written fresh in StrataVision. StrataField's components are tied to its
  own wording and data loading, and StrataVision draws shares and confidence rather than recorded
  layers. shadcn/ui parts are copied in, as shadcn intends.
- **StrataField needs no code changes for the first version.**
- All user-facing wording lives in one file, `src/text/index.ts`, as in StrataField. The word
  "StrataVision" is the app's name only; screens say "proposed layers".

## Data access

- The Rust side has one job: open `%APPDATA%\Strata\strata.db` **read-only** and return every
  borewell that is not in the Recycle bin, with its layers, pipes and water readings. It honours
  `STRATA_DATA_DIR`, like StrataField.
- StrataVision never changes the records and never runs migrations. It never creates the data
  folder or the database. (SQLite may add its two bookkeeping files, `-wal` and `-shm`, beside an
  existing database when it is read, as it does for StrataField.)
- The elevation grid (`lucknow-elevation.bin`) is read from the submodule at build time.
- Data is reloaded by a **Refresh** button and whenever the window regains focus. StrataField may be
  open at the same time (the database is in WAL mode).

## The model

### Drilling groups

| Group | Soil classes |
|---|---|
| Clay | CLAY, SILTY_CLAY, SANDY_CLAY, SILT |
| Fine sand | FINE_SAND |
| Water-bearing | MEDIUM_SAND, COARSE_SAND, YELLOW_SAND, GRAVEL, SANDY_GRAVEL |
| Hard | KANKAR, CLAY_KANKAR, SANDY_KANKAR, ROCK, BOULDER |

- A soil type added by hand, with no class in this table, falls back on its family: CLAY to Clay,
  SAND to Water-bearing, ROCK to Hard. OTHER and NONE do not vote.
- A SAND-family layer that the driller ticked as water-bearing counts as Water-bearing even if it is
  Fine sand. The tick only ever upgrades; an unticked layer keeps its class, because the tick is not
  filled in on every record.
- "Not recorded" and gaps between layers never vote.
- Yellow Sand as Water-bearing is an assumption to confirm with DWO.

### Question answered

`predictColumn(lat, lon, borewells, grid)` returns the ground at that point as steps of 5 ft from the
surface down to the deepest depth any voter reaches. Each step has:

- `shares`: the share of the vote for each group (adds up to 1), or empty if nobody voted;
- `likely`: the group with the largest share, or none;
- `confidence`: `likely`, `rough` or `none`;
- `sources`: the borewells that voted, with distance and weight, nearest first.

### How the vote works

1. **Common height.** Each borewell's layers are placed by height above sea level: ground height
   minus depth. Ground height is the borewell's own `groundElevationM` when recorded, otherwise the
   elevation grid. Layer depths are always feet (StrataField converts logs written in metres when it
   reads them). The asked point's ground height comes from the grid; results are shown as depth below
   ground at that point.
2. **Who votes.** For a step, a borewell votes if it is within 5 km, has a location, and has a
   recorded layer covering the middle of that step's height. The 12 nearest such borewells are used,
   with at most 3 from any one spot, so a place with many logs cannot fill the room.
3. **Weight.** `1 / distance²` (distance floored at 25 m), multiplied by:
   - record quality: good 1.0, fair or unknown 0.7, poor 0.4;
   - location: 0.5 if the location came from an address lookup, otherwise 1.0;
   - crowding: divided by the number of voters within 100 m of this borewell, itself included, so a
     crowded site counts once.
4. **Confidence** for a step, counting voters more than 100 m apart as separate sites:
   - `likely`: nearest voter within 1 km, at least 3 sites, largest share at least 0.6;
   - `rough`: nearest voter within 3 km and at least 2 sites;
   - `none`: anything else. `likely` is then blank.

All the numbers above are named constants in one place. They are starting values, to be adjusted
once against the real data using the accuracy check, with the aim that a `likely` step is right at
least 7 times in 10.

### Accuracy check

`checkModel(borewells, grid)` hides each borewell in turn, together with every other borewell at the
same spot (two logs of one spot agreeing says nothing about a place nobody drilled), predicts its
column from the rest, and compares step by step against what was recorded. It returns:

- the share of steps where `likely` matched the recorded group, overall and separately for
  `likely` and `rough` steps;
- the best guess scored for every step, split by how far away the nearest borewell behind that step
  was: under 1 km, 1 to 3 km, over 3 km;
- **odd ones out**: borewells whose own match is far below what is usual at that distance (under
  half the typical match in a distance band, on at least 10 comparable steps and against at least 5
  borewells), worst first.

With fewer than 10 usable borewells it reports that it cannot judge yet.

### Speed

Borewells are prepared once per load (layers converted to height and group). A column is then a few
thousand operations. A section is about 200 columns, a city map about 100 × 100 points at one depth.
The accuracy check on 500 borewells must finish within 5 seconds and runs off the main thread.

## Screens

One window with a map on the left and a panel on the right, and four places to go.

### Map: new site

- Borewells are shown as pins. Clicking a pin shows its recorded column and an "Open in StrataField"
  hint with its ID.
- Clicking anywhere else shows **Proposed layers here**: the predicted column, drawn faded and
  dashed; full strength where `likely`, paler where `rough`, blank and labelled "Not enough data"
  where `none`.
- Below it: the estimated water depth with its period (from `estimateWater`), and
  "From N borewells, nearest X m".
- Clicking a step lists the shares in words ("mostly water-bearing sand, some clay") and the
  borewells behind it.

### Map: drilling suggestion

Shown under the proposed column for a chosen spot. It has two halves, always shown together, so the
suggestion can be weighed against what was really done.

**What was done nearby** (the 5 nearest sites within 3 km, crowded sites counted once):

- how deep they were drilled: the range and the middle value;
- where slotted pipe was placed in each, drawn beside the proposed column at the same height;
- how deep the pumps hang: the range and the middle value, from borewells that record it.

**What the model proposes:**

- **Expected water level**: from `estimateWater`, with its period.
- **Where to put slotted pipe**: each run of Water-bearing steps that is at least 10 ft thick, lies
  below the expected water level, and is `likely` or `rough`. Each run carries the weaker confidence
  of its steps.
- **How deep to drill**: the bottom of the lowest such run, but never deeper than the deepest
  borewell among the nearby sites.

If there is no such run, or no expected water level, it says so and shows only what was done nearby.
With no nearby sites either, there is no suggestion.

The panel is headed as a suggestion from past drilling; the driller decides. The rule for "how deep
to drill" is an assumption to confirm with DWO.

`suggestDrilling(column, waterEstimate, nearby)` is a separate function beside the model; it reads
the model's output and does not change it.

### Section

- Draw a line with bends on the map. The drawing shows the ground profile, real borewells within a
  chosen distance of the line as solid columns, and the space between and beyond them filled from the
  model, one column for every few pixels.
- Same three strengths as the new-site column. The estimated water line is drawn where water
  estimates exist.
- Save as picture and as PDF.

### City map

An overlay on the map with a mode switch:

- **Ground at a depth**: a depth slider; colour is the likeliest group at that depth.
- **Depth to water-bearing sand**: depth of the first Water-bearing step that is at least 10 ft
  thick.
- **Where data is thin**: the confidence at a chosen depth on its own, so gaps in coverage are
  obvious.

In every mode colour is paler where `rough` and absent where `none`.

### Data quality

- The accuracy check result in plain words, for example "Checked against 487 borewells: right about
  3 times in 4 when another borewell is within 1 km".
- The odd-ones-out list, each with its ID, area and how badly it disagrees, so it can be looked up
  and corrected in StrataField.
- A fixed line: these are proposals from past drilling, not measurements.

A "How good are these estimates?" link on the other three screens opens this one.

## Edge cases

- No database: "Install StrataField and add borewells first". Nothing is created.
- Database newer than the pinned `strata_db` understands: "Update StrataVision". Older: "Open
  StrataField once to upgrade it". The file is not touched in either case.
- Borewells without a location, without layers, or with gaps simply do not vote for those depths.
- A point outside the elevation grid, or with no voter within 5 km: "Not enough data".
- Below the deepest voter the column ends; it is never extended.

## Testing

- Unit tests (Vitest) for the model on made-up ground with a known answer:
  a flat layer is recovered between borewells; a crowded site does not outvote a single borewell the
  same distance away; on sloping ground a layer is matched by height, not depth; confidence drops
  with distance, with fewer sites and with disagreement; "not recorded" never votes; poor records and
  address-located borewells count less; the water-bearing tick upgrades fine sand.
- Unit tests for the drilling suggestion: slotted pipe is only proposed below the water level and
  only in runs of 10 ft or more; depth is capped at the deepest nearby borewell; no water estimate or
  no water-bearing run gives "nearby only"; a crowded site counts once among the 5 nearest.
- Unit tests for the accuracy check: a deliberately wrong borewell appears in odd ones out; fewer
  than 10 borewells gives "cannot judge".
- A 500-borewell made-up city, many overlapping, with time limits for one column, one section, one
  city map and the accuracy check.
- Rust test: the database is opened read-only and a newer schema is refused.
- One end-to-end run of the real app on a scratch data folder: click a spot, get a column.
- CI: typecheck, lint, unit tests, Rust format, lint and tests, build.

## Phases

Each phase is its own branch and pull request in the StrataVision repository.

1. **Skeleton.** Repository, submodule, Tauri app, read-only database command, borewells on a map,
   the no-database and version messages, CI.
2. **Model.** `predictColumn`, `checkModel`, the constants, all model tests. No screens.
3. **New site.** Proposed column on the map; Data quality screen with accuracy and odd ones out.
   The constants are adjusted against the real data here.
4. **Drilling suggestion** on the new-site panel.
5. **Section.**
6. **3D slice.** A drawn section, with its width, shown as a block cut out of the ground like a
   slice of cake, which can be turned and tilted. The top is the map strip with its borewell pins;
   the long side is the section itself; the back and the ends are further cuts through the model.
   Every side is a flat section drawing, so the faded, dashed and blank styles for confidence carry
   over unchanged. A line with bends gives one flat side per straight part. Heights are stretched,
   with a control for how much. The inside of the block is not shown; moving the line or changing the
   width cuts a new slice. Built from flat panels placed with CSS 3D transforms, so no 3D library is
   added; one would only be needed for curved or see-through surfaces.
7. **City map**, three modes.
8. **More maps.** Water-bearing thickness down to a chosen depth; and how fast the water level is
   changing, in feet per year, from borewells with at least two dated readings a year or more apart.
   Detailed in its own short spec before it is built.

Not planned: several sections standing together on the city map (a fence diagram), and a solid 3D
block of the whole city. Either can follow the 3D slice if it proves its worth.

Installer signing, automatic updates and a user manual come with the first release, after phase 3
at the earliest, following StrataField's release workflow.
