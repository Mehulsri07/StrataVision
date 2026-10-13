# StrataVision Phase 1 (Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new StrataVision desktop app, in its own repository, that opens StrataField's database read-only and shows the borewells on a map, with clear messages when it cannot.

**Architecture:** StrataField is a git submodule at `strata/`, pinned to tag `v1.0.15`; `@strata/core` and the `strata_db` crate are used from it by path. The Rust side is one stateless command that opens `strata.db` read-only, checks its version and returns every active borewell with layers, pipes and water readings. The screen is a single React page: map, pins, a side panel, a Refresh button.

**Tech Stack:** Tauri 2, Rust (rusqlite 0.40.2 via `strata_db`), React 19, TypeScript ~7.0.2, Vite 8, Tailwind 4, shadcn/ui, Leaflet 1.9 with react-leaflet 5. Windows only.

**Spec:** `docs/superpowers/specs/2026-10-13-stratavision-design.md` (sections "Repository and shared code", "Data access", "Edge cases", phase 1 of "Phases").

## Global Constraints

- New repository `Mehulsri07/StrataVision`, cloned to `C:\Users\Lenovo\Desktop\Projects\StrataVision`. Creating it on GitHub needs the owner's go-ahead and their choice of public or private.
- StrataField is not changed by this phase, apart from one README line (Task 5).
- StrataVision never writes to `strata.db`, never runs migrations, and never creates the data folder.
- Data folder: `STRATA_DATA_DIR` if set, otherwise `%APPDATA%\Strata`.
- All wording shown to users lives in `app/src/text/index.ts`. Plain language; the screens never say "schema", "database version" or "read-only".
- Dependency versions shared with StrataField are copied exactly from `strata/app/package.json` and `strata/app/src-tauri/Cargo.toml`. `rusqlite` must be `0.40.2` with `bundled`, the same as `strata_db`.
- App identifier `com.strata.stratavision`, product name and window title `StrataVision`, version `0.1.0`.
- Commits and pull requests carry no AI attribution lines. Work happens on branch `phase-1-skeleton` and reaches `main` through one pull request, which the owner merges.
- Not in this phase: the model, any second screen or navigation, the offline map (online OpenStreetMap tiles only; without internet the pins still show on a plain background), installer signing, automatic updates.

## Review Focus

Conditions the spec implies that are most likely to hurt a real user. Each has a test in the task named.

1. StrataField is open, or was the last thing to close, when StrataVision loads: loading must work both while another connection is open and after a clean close that removed the `-wal` and `-shm` files. (Task 2)
2. Loading must leave no trace: a missing data folder stays missing, no `strata.db` appears, and an existing file's version number is unchanged. (Task 2, Task 4 smoke test)
3. A `strata.db` that is empty or not a database gives a message, not a crash. (Task 2)
4. Borewells in the Recycle bin are not loaded; borewells with no location are loaded but not pinned, and the screen says how many were left off. (Task 2, Task 3)
5. The data changes in StrataField while StrataVision is open: Refresh, or returning to the window, shows the new data without restarting. (Task 3)

---

### Task 1: Repository with the shared code linked

A repository where `npm run dev` opens an empty StrataVision window and both the TypeScript and Rust sides can use StrataField's shared code.

**Files:**
- Create: `README.md`, `LICENSE` (MIT, copied from `strata/`), `.gitignore`, `.gitmodules` (via `git submodule add`)
- Create: `package.json`, `Cargo.toml`, `eslint.config.js`
- Create: `app/package.json`, `app/index.html`, `app/vite.config.ts`, `app/tsconfig.json`, `app/tsconfig.node.json`, `app/components.json`
- Create: `app/src/main.tsx`, `app/src/App.tsx`, `app/src/index.css`, `app/src/vite-env.d.ts`
- Create: `app/src-tauri/Cargo.toml`, `app/src-tauri/build.rs`, `app/src-tauri/tauri.conf.json`, `app/src-tauri/capabilities/default.json`, `app/src-tauri/src/main.rs`, `app/src-tauri/src/lib.rs`, `app/src-tauri/icons/*`
- Move in: `docs/superpowers/specs/2026-10-13-stratavision-design.md` and this plan, copied from StrataField's `stratavision-design` branch

**Interfaces:**
- Produces: npm workspace `@strata/vision` in `app/` that can `import … from "@strata/core"`; Rust package `stratavision` (lib `stratavision_lib`) that can `use strata_db::…`; root scripts `dev`, `build`, `typecheck`, `lint`.

- [ ] **Step 1: Ask the owner to confirm creating the GitHub repository, and whether it is public or private.** Do not run `gh repo create` before the answer.

- [ ] **Step 2: Create the repository and its first commit on `main`**

`main` gets only `README.md` (one paragraph: what StrataVision is, that it needs StrataField's data, a link to the spec), `LICENSE` and `.gitignore` (StrataField's, minus the StrataField-only lines). Push, then `git switch -c phase-1-skeleton`.

- [ ] **Step 3: Add StrataField as a pinned submodule**

```bash
git submodule add https://github.com/Mehulsri07/StrataField.git strata
git -C strata checkout v1.0.15
```

- [ ] **Step 4: Write the workspace files**

Root `package.json`: `"private": true`, `"workspaces": ["strata/core", "app"]`, scripts:

```json
{
  "dev": "npm run tauri -w app -- dev",
  "build": "npm run tauri -w app -- build",
  "typecheck": "npm run typecheck -w app",
  "lint": "eslint app"
}
```

Root dev dependencies: the five ESLint packages from `strata/package.json`, same versions. `eslint.config.js`: StrataField's, with ignores `["**/node_modules/**", "**/dist/**", "target/**", "strata/**", "app/src-tauri/**", "app/src/components/ui/**"]` and without the `e2e`/`scripts` block.

Root `Cargo.toml`. The `exclude` line is required: without it Cargo treats the submodule's crates as members of this workspace and refuses, because they belong to StrataField's.

```toml
[workspace]
resolver = "2"
members = ["app/src-tauri"]
exclude = ["strata"]

[profile.release]
codegen-units = 1
lto = true
opt-level = 3
panic = "abort"
strip = true
```

- [ ] **Step 5: Write the app shell**

- `app/package.json`: name `@strata/vision`, version `0.1.0`, the same five scripts as `strata/app/package.json`. Dependencies, versions as in StrataField: `@strata/core` (`*`), `@tauri-apps/api`, `@base-ui/react`, `@fontsource/ibm-plex-sans`, `class-variance-authority`, `cn`, `leaflet`, `lucide-react`, `react`, `react-dom`, `react-leaflet`, `tw-animate-css`. Dev dependencies: `@tailwindcss/vite`, `@tauri-apps/cli`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `shadcn`, `tailwindcss`, `typescript`, `vite`.
- `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `components.json`, `build.rs`, `src/main.rs`: copied from `strata/app`, with "StrataField"/`stratafield_lib` changed to "StrataVision"/`stratavision_lib`.
- `app/src/index.css`: the imports, `:root` design tokens and `@theme` mapping from `strata/app/src/index.css`, so the two apps look related. Leave out rules for screens StrataVision does not have.
- `app/src/App.tsx`: renders the app name only, for now.
- `app/src-tauri/Cargo.toml`: package `stratavision` `0.1.0`, lib name `stratavision_lib`; dependencies `tauri = { version = "2" }`, `serde` (derive), `strata_db = { path = "../../strata/core/db" }`, `rusqlite = { version = "0.40.2", features = ["bundled"] }`; dev dependency `tempfile = "3"`; build dependency `tauri-build = "2"`.
- `tauri.conf.json`: from StrataField's, with the name, identifier and version above; the window created normally (no `"create": false`); no `assetProtocol`, no `plugins`, no `resources`, no `installerHooks`; `startMenuFolder` `StrataVision`; CSP as StrataField's without the `asset:` entries.
- `capabilities/default.json`: window `main`, permissions `["core:default"]`.
- `src/lib.rs`: `pub fn run()` building a Tauri app with no commands yet.
- Icons: `npm run tauri -w app -- icon ../strata/app/icon-source.svg`. This reuses StrataField's logo as a placeholder until StrataVision has its own.
- shadcn button: `npx shadcn@latest add button` inside `app/`.

- [ ] **Step 6: Verify both sides build and the shared code resolves**

Temporarily put `import { familyOf } from "@strata/core"; console.log(familyOf);` in `App.tsx` and `const _: i64 = strata_db::schema::LATEST_VERSION;` in `lib.rs`, then:

Run: `npm install`, `npm run typecheck`, `npm run lint`, `npm run build -w app`, `cargo clippy --workspace --all-targets -- -D warnings`
Expected: all succeed. Remove the two temporary lines.

Run: `npm run dev`
Expected: a window titled StrataVision opens showing the app name.

- [ ] **Step 7: Commit** — `Set up StrataVision with StrataField's shared code`

---

### Task 2: Read the shared database without changing it

**Files:**
- Create: `app/src-tauri/src/data.rs` (with its tests in a `#[cfg(test)]` module)
- Modify: `app/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: from `strata_db`: `db::DB_FILE_NAME`, `schema::{current_version, LATEST_VERSION}`, `models::{Borewell, StrataLayer, PipeSegment, WaterReading, SearchFilters}`, `repo::borewells::search`, `repo::layers::{pipes_for, water_for}`. In tests only: `Database::open`, `repo::create_with_layers`, `repo::borewells::soft_delete`, `models::BorewellInput`.
- Produces:

```rust
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SiteRecord {
    pub borewell: Borewell,
    pub strata: Vec<StrataLayer>,
    pub pipes: Vec<PipeSegment>,
    pub water_readings: Vec<WaterReading>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LoadError {
    NoDatabase,
    Newer,
    Older,
    Other { message: String },
}

pub fn data_dir(roaming_app_data: &Path) -> PathBuf;                 // STRATA_DATA_DIR, else <roaming>/Strata
pub fn load(data_dir: &Path) -> Result<Vec<SiteRecord>, LoadError>;
```

  Tauri command `load_data` (no arguments), returning `Result<Vec<SiteRecord>, LoadError>`. To the screen an error arrives as `{ kind: "noDatabase" | "newer" | "older" }` or `{ kind: "other", message }`.

- [ ] **Step 1: Write the failing tests** in `data.rs`

A helper `seeded(dir)` creates a real database with `Database::open(dir)`, adds borewell `BW-1` (latitude 26.85, longitude 80.95) with one layer 0 to 20 ft, and returns the `Database`. Each test uses its own `tempfile::tempdir()`.

```rust
#[test] fn missing_folder_is_no_database_and_stays_missing() {
    let dir = tmp.path().join("nothing-here");
    assert_eq!(load(&dir), Err(LoadError::NoDatabase));
    assert!(!dir.exists());
}
#[test] fn empty_file_is_no_database() {          // a 0-byte strata.db
    assert_eq!(load(dir), Err(LoadError::NoDatabase));
}
#[test] fn not_a_database_is_other() {            // strata.db containing "hello"
    assert!(matches!(load(dir), Err(LoadError::Other { .. })));
}
#[test] fn loads_after_a_clean_close() {
    drop(seeded(dir));                            // -wal and -shm are gone
    let got = load(dir).unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].borewell.borewell_id, "BW-1");
    assert_eq!(got[0].strata.len(), 1);
}
#[test] fn loads_while_another_app_has_it_open() {
    let _open = seeded(dir);                      // kept open, as StrataField would
    assert_eq!(load(dir).unwrap().len(), 1);
}
#[test] fn recycle_bin_is_left_out() {            // soft_delete BW-1
    assert_eq!(load(dir).unwrap().len(), 0);
}
#[test] fn newer_and_older_are_refused_and_untouched() {
    // set PRAGMA user_version = LATEST_VERSION + 1, close
    assert_eq!(load(dir), Err(LoadError::Newer));
    // user_version is still LATEST_VERSION + 1
    // set PRAGMA user_version = LATEST_VERSION - 1, close
    assert_eq!(load(dir), Err(LoadError::Older));
    // user_version is still LATEST_VERSION - 1
}
#[test] fn data_dir_prefers_the_environment_variable() {
    // without STRATA_DATA_DIR: <roaming>/Strata
}
```

- [ ] **Step 2: Run them** — `cargo test -p stratavision`. Expected: they do not compile (`load` not defined).

- [ ] **Step 3: Implement `data_dir` and `load` in `data.rs`**

`load`, in order: no file at `<data_dir>/strata.db` gives `NoDatabase`; open with `rusqlite::Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)` and a 5 second busy timeout; read `current_version`: 0 gives `NoDatabase`, above `LATEST_VERSION` gives `Newer`, below gives `Older`; then, inside one `unchecked_transaction()` so every query sees the same moment, `search(&conn, &SearchFilters::default())` and for each result `pipes_for` and `water_for`. Any `strata_db` or `rusqlite` error becomes `Other { message }`. No `PRAGMA journal_mode`, no `Database::open`, no `create_dir_all`.

Leave this comment on the per-borewell loop: `// ponytail: two small queries per borewell; fine at 500, one grouped query each if it reaches thousands`.

If `loads_after_a_clean_close` fails because SQLite cannot open a WAL database read-only on this machine, open read-write instead and run `PRAGMA query_only = ON` first; the "untouched" assertions must still pass.

- [ ] **Step 4: Add the command to `lib.rs`** — `load_data(app: AppHandle)` calls `data::load(&data::data_dir(&app.path().data_dir()?))`, mapping a path failure to `LoadError::Other`; register it in `generate_handler!`.

- [ ] **Step 5: Run** — `cargo test -p stratavision`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`. Expected: 8 tests pass, no warnings.

- [ ] **Step 6: Commit** — `Read StrataField's records without changing them`

---

### Task 3: Borewells on a map, and plain messages when there are none

**Files:**
- Create: `app/src/lib/api.ts`, `app/src/text/index.ts`, `app/src/components/SiteMap.tsx`
- Modify: `app/src/App.tsx`

**Interfaces:**
- Consumes: command `load_data` and its error shape from Task 2; types `Borewell`, `StrataLayer`, `PipeSegment`, `WaterReading` from `@strata/core`.
- Produces:

```ts
// lib/api.ts
export interface SiteRecord { borewell: Borewell; strata: StrataLayer[]; pipes: PipeSegment[]; waterReadings: WaterReading[] }
export type LoadError = { kind: "noDatabase" | "newer" | "older" } | { kind: "other"; message: string };
export function loadData(): Promise<SiteRecord[]>;   // rejects with LoadError

// components/SiteMap.tsx
export function SiteMap(props: { sites: SiteRecord[]; selectedId: string | null; onSelect: (id: string | null) => void }): JSX.Element;
```

- [ ] **Step 1: Write the wording** in `text/index.ts`, exactly:

| Key | Text |
|---|---|
| `noDatabase` | No borewell records were found on this computer. Install StrataField and add borewells first. |
| `newer` | Your records were saved by a newer StrataField than this StrataVision understands. Update StrataVision to open them. |
| `older` | Your records need a one-time upgrade. Open StrataField once, then come back and press Refresh. |
| `other` | The records could not be read. |
| `empty` | There are no borewells yet. Add some in StrataField. |
| `onMap(n)` | "1 borewell on the map" / "{n} borewells on the map" |
| `notShown(m)` | "1 without a location is not shown" / "{m} without a location are not shown" |
| `refresh` | Refresh |
| `openInStrataField` | To see everything about this borewell or change it, open it in StrataField. |

- [ ] **Step 2: Implement `loadData`** with `invoke("load_data")`.

- [ ] **Step 3: Implement `SiteMap`**

A react-leaflet `MapContainer` with `preferCanvas`, centred on Lucknow `[26.85, 80.95]` at zoom 12, fitted to the sites' bounds when there are any; the OpenStreetMap tile layer with its attribution, as in `strata/app/src/components/map/BaseMap.tsx`; one `CircleMarker` for each site that has both latitude and longitude, with the borewell's ID as a tooltip, drawn larger when selected. Clicking a marker selects it; clicking the map clears the selection. No clustering.

- [ ] **Step 4: Implement the page in `App.tsx`**

- States: loading, failed (a `LoadError`), ready (the sites).
- Load on start, on the Refresh button, and on the window's `focus` event. A reload keeps the map on screen and the selection if that borewell still exists.
- Failed: the message for its kind, centred, with Refresh under it; for `other`, the Rust message in small text below.
- Ready with no sites: the `empty` message. Otherwise: the map on the left; on the right a panel with `onMap(n)`, `notShown(m)` when m is above zero, and, for the selected borewell, its ID, area, depth with unit, drilling date, and `openInStrataField`.
- Header: the app name and Refresh.

- [ ] **Step 5: Verify in the real app**

Run: `npm run typecheck`, `npm run lint`.

Run with an empty scratch folder: `$env:STRATA_DATA_DIR = "$env:TEMP\vision-empty"; npm run dev`
Expected: the `noDatabase` message; `$env:TEMP\vision-empty` does not exist afterwards.

Run with a copy of the real records: copy `%APPDATA%\Strata\strata.db` into `$env:TEMP\vision-copy`, set `STRATA_DATA_DIR` to it, `npm run dev`.
Expected: pins across Lucknow and a count that matches StrataField's borewell count less those without a location; selecting a pin fills the panel. With StrataField pointed at the same folder, add a borewell there, return to StrataVision: it appears without restarting.

- [ ] **Step 6: Commit** — `Show borewells on a map`

---

### Task 4: Checks on every pull request

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/dependabot.yml`, `e2e/smoke.mjs`
- Modify: `package.json` (script `"smoke": "node e2e/smoke.mjs"`), `eslint.config.js` (Node globals for `e2e/**/*.mjs`, and lint `app e2e`)

**Interfaces:**
- Consumes: the debug build at `target/debug/stratavision.exe`; the `noDatabase` wording from Task 3.

- [ ] **Step 1: Write `e2e/smoke.mjs`**, the one test of the real app

It starts `target/debug/stratavision.exe` with `STRATA_DATA_DIR` set to a folder that does not exist and `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` (the way `strata/e2e/harness.mjs` does), finds the page through `http://127.0.0.1:9333/json`, reads `document.body.innerText` over its WebSocket with `Runtime.evaluate` (Node 22's built-in `fetch` and `WebSocket`; no new dependency), and retries for up to 30 seconds. It passes when the text contains "Install StrataField and add borewells first" and the folder still does not exist. It always stops the app, and exits non-zero on failure with the text it last saw.

- [ ] **Step 2: Run it locally**

Run: `npm run tauri -w app -- build --debug --no-bundle`, then `npm run smoke`
Expected: exit code 0. Then break it on purpose (change the expected sentence), confirm it fails with the page text shown, and restore it.

- [ ] **Step 3: Write `ci.yml`**, modelled on `strata/.github/workflows/ci.yml`

Triggers, `paths-ignore` for `**.md` and `docs/**`, and concurrency as StrataField's. Every `actions/checkout` step uses `submodules: true`. Jobs:

- `check` (ubuntu): `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build -w app`.
- `rust` (windows): placeholder `app/dist/index.html`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`.
- `smoke` (windows): `npm ci`, the debug build from Step 2, `npm run smoke`.
- `audit` (ubuntu): `npm audit --omit=dev --audit-level=high`, `cargo audit`.

`dependabot.yml`: StrataField's, without the `pmtiles` ignore.

- [ ] **Step 4: Commit** — `Add CI and a start-up test of the real app`

---

### Task 5: Pull request, and StrataField's roadmap

**Files:**
- Modify (StrataField repository): `README.md` roadmap entry for StrataVision

- [ ] **Step 1: Run everything once more** in StrataVision: `npm run typecheck`, `npm run lint`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `npm run smoke`. Expected: all pass.

- [ ] **Step 2: Push `phase-1-skeleton` and open the pull request into `main`.** Describe what the app does now and what it does not yet. Turn Auto-fix on. Confirm all four CI jobs pass. The owner merges.

- [ ] **Step 3: Update StrataField's README.** On StrataField's `stratavision-design` branch, remove `docs/superpowers/` (the spec and plan now live in StrataVision) and replace the roadmap entry with:

```markdown
- **[StrataVision](https://github.com/Mehulsri07/StrataVision)**, the analysis side: a proposed
  picture of the ground under the whole city, built from these records. It is a separate app that
  reads the same database and shares `core/`.
```

Open a pull request for it. It is documentation only, so CI is skipped and the owner merges it by hand.

- [ ] **Step 4: Tell the owner what is left for them:** the two merges, and whether `main` on StrataVision should get the same required checks and auto-merge as StrataField.
