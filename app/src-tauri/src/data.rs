//! Reading StrataField's records. StrataVision only ever reads: it never changes the records,
//! never upgrades them and never creates the data folder or the database.

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use strata_db::db::DB_FILE_NAME;
use strata_db::models::{
    Borewell, Material, PipeSegment, SearchFilters, StrataLayer, WaterReading,
};
use strata_db::repo::{borewells, layers, materials};
use strata_db::schema;

/// Name of the folder, inside the roaming app-data folder, that every Strata app shares.
const SHARED_FOLDER: &str = "Strata";

/// One borewell with everything the analysis uses.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SiteRecord {
    pub borewell: Borewell,
    pub strata: Vec<StrataLayer>,
    pub pipes: Vec<PipeSegment>,
    pub water_readings: Vec<WaterReading>,
}

/// Everything read in one go, all as it was at the same moment.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Records {
    pub sites: Vec<SiteRecord>,
    /// Every soil type, built-in and added by hand; layers refer to them by id.
    pub materials: Vec<Material>,
}

/// Why the records could not be read. The screens choose the wording from `kind`.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LoadError {
    /// StrataField has not saved anything on this computer yet.
    NoDatabase,
    /// Saved by a newer StrataField than this StrataVision was built for.
    Newer,
    /// Not yet upgraded by the installed StrataField.
    Older,
    Other {
        message: String,
    },
}

impl<E: std::error::Error> From<E> for LoadError {
    fn from(e: E) -> Self {
        LoadError::Other {
            message: e.to_string(),
        }
    }
}

/// Where the shared records live: `%APPDATA%\Strata`, or `STRATA_DATA_DIR` for development and
/// tests (the same variable StrataField uses, so both apps can be pointed at one scratch folder).
pub fn data_dir(roaming_app_data: &Path) -> PathBuf {
    match std::env::var_os("STRATA_DATA_DIR") {
        Some(dir) => PathBuf::from(dir),
        None => roaming_app_data.join(SHARED_FOLDER),
    }
}

/// Every borewell that is not in the Recycle bin, and the soil types, read from `<data_dir>/strata.db` as it is at
/// this moment. The file is opened read-only: the records are never upgraded or changed, and the
/// folder and the file are never created. SQLite may add its two bookkeeping files (`-wal` and
/// `-shm`) beside an existing database, exactly as StrataField itself does.
pub fn load(data_dir: &Path) -> Result<Records, LoadError> {
    let path = data_dir.join(DB_FILE_NAME);
    if !path.exists() {
        return Err(LoadError::NoDatabase);
    }
    let conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    // StrataField may be in the middle of saving.
    conn.busy_timeout(Duration::from_secs(5))?;

    match schema::current_version(&conn)? {
        0 => return Err(LoadError::NoDatabase),
        v if v > schema::LATEST_VERSION => return Err(LoadError::Newer),
        v if v < schema::LATEST_VERSION => return Err(LoadError::Older),
        _ => {}
    }

    // One transaction, so every query below sees the records as they were at the same moment.
    let tx = conn.unchecked_transaction()?;
    let mut sites = Vec::new();
    // ponytail: two small queries per borewell; fine at 500, one grouped query each if it reaches thousands
    for item in borewells::search(&tx, &SearchFilters::default())? {
        sites.push(SiteRecord {
            pipes: layers::pipes_for(&tx, &item.borewell.id)?,
            water_readings: layers::water_for(&tx, &item.borewell.id)?,
            borewell: item.borewell,
            strata: item.strata,
        });
    }
    Ok(Records {
        sites,
        materials: materials::list(&tx)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use strata_db::models::BorewellInput;
    use strata_db::schema::{current_version, LATEST_VERSION};
    use strata_db::{repo, Database};

    /// A real database, made the way StrataField makes it. BW-1 has a location, one layer, one
    /// pipe and one water reading; BW-2 has no location and nothing else.
    fn seeded(dir: &Path) -> Database {
        let (db, _) = Database::open(dir).unwrap();
        db.with_tx(|tx| {
            repo::create_with_layers(
                tx,
                &BorewellInput {
                    borewell_id: "BW-2".into(),
                    ..Default::default()
                },
                &[],
                &[],
            )?;
            let b = repo::create_with_layers(
                tx,
                &BorewellInput {
                    borewell_id: "BW-1".into(),
                    latitude: Some(26.85),
                    longitude: Some(80.95),
                    ..Default::default()
                },
                &[StrataLayer {
                    start_depth: 0.0,
                    end_depth: 20.0,
                    material: "Clay".into(),
                    material_id: Some("clay".into()),
                    ..Default::default()
                }],
                &[PipeSegment {
                    start_depth: 10.0,
                    end_depth: 20.0,
                    pipe_type: "slotted".into(),
                    ..Default::default()
                }],
            )?;
            repo::layers::add_water_reading(
                tx,
                &b.id,
                &WaterReading {
                    measured_on: "2026-01-15".into(),
                    static_level: Some(35.0),
                    ..Default::default()
                },
            )?;
            Ok(())
        })
        .unwrap();
        db
    }

    fn site<'a>(sites: &'a [SiteRecord], borewell_id: &str) -> &'a SiteRecord {
        sites
            .iter()
            .find(|s| s.borewell.borewell_id == borewell_id)
            .unwrap()
    }

    fn set_version(dir: &Path, version: i64) {
        let conn = rusqlite::Connection::open(dir.join(DB_FILE_NAME)).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {version}"))
            .unwrap();
    }

    fn version(dir: &Path) -> i64 {
        let conn = rusqlite::Connection::open(dir.join(DB_FILE_NAME)).unwrap();
        current_version(&conn).unwrap()
    }

    #[test]
    fn missing_folder_is_no_database_and_stays_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("nothing-here");
        assert_eq!(load(&dir), Err(LoadError::NoDatabase));
        assert!(!dir.exists());
    }

    #[test]
    fn empty_file_is_no_database() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join(DB_FILE_NAME), b"").unwrap();
        assert_eq!(load(tmp.path()), Err(LoadError::NoDatabase));
    }

    #[test]
    fn not_a_database_is_other() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(
            tmp.path().join(DB_FILE_NAME),
            b"hello, this is not a database",
        )
        .unwrap();
        assert!(matches!(load(tmp.path()), Err(LoadError::Other { .. })));
    }

    #[test]
    fn loads_after_a_clean_close() {
        let tmp = tempfile::tempdir().unwrap();
        drop(seeded(tmp.path()));
        // The state this test is about: StrataField closed and took its bookkeeping files with it.
        let db_file = tmp.path().join(DB_FILE_NAME);
        assert!(!tmp.path().join("strata.db-wal").exists());
        assert!(!tmp.path().join("strata.db-shm").exists());
        let before = std::fs::read(&db_file).unwrap();

        let records = load(tmp.path()).unwrap();
        // The soil types come with the records: hand-added ones are only known to the database.
        assert!(records
            .materials
            .iter()
            .any(|m| m.id == "clay" && m.lithology_class.as_deref() == Some("CLAY")));
        let got = records.sites;
        assert_eq!(got.len(), 2);
        let full = site(&got, "BW-1");
        assert_eq!(full.strata.len(), 1);
        assert_eq!(full.pipes.len(), 1);
        assert_eq!(full.pipes[0].pipe_type, "slotted");
        assert_eq!(full.water_readings.len(), 1);
        assert_eq!(full.water_readings[0].static_level, Some(35.0));
        // A borewell with no location is still loaded; the map simply cannot show it.
        let bare = site(&got, "BW-2");
        assert_eq!(bare.borewell.latitude, None);
        assert!(bare.strata.is_empty() && bare.pipes.is_empty() && bare.water_readings.is_empty());

        assert_eq!(
            std::fs::read(&db_file).unwrap(),
            before,
            "the records were changed"
        );
    }

    #[test]
    fn loads_while_another_app_has_it_open() {
        let tmp = tempfile::tempdir().unwrap();
        let _open = seeded(tmp.path());
        assert_eq!(load(tmp.path()).unwrap().sites.len(), 2);
    }

    #[test]
    fn recycle_bin_is_left_out() {
        let tmp = tempfile::tempdir().unwrap();
        let db = seeded(tmp.path());
        db.with_tx(|tx| {
            let all = repo::borewells::search(tx, &Default::default())?;
            let bw1 = all
                .iter()
                .find(|i| i.borewell.borewell_id == "BW-1")
                .unwrap();
            repo::borewells::soft_delete(tx, &bw1.borewell.id)
        })
        .unwrap();
        drop(db);
        let got = load(tmp.path()).unwrap().sites;
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].borewell.borewell_id, "BW-2");
    }

    #[test]
    fn newer_and_older_are_refused_and_untouched() {
        let tmp = tempfile::tempdir().unwrap();
        drop(seeded(tmp.path()));

        set_version(tmp.path(), LATEST_VERSION + 1);
        assert_eq!(load(tmp.path()), Err(LoadError::Newer));
        assert_eq!(version(tmp.path()), LATEST_VERSION + 1);

        set_version(tmp.path(), LATEST_VERSION - 1);
        assert_eq!(load(tmp.path()), Err(LoadError::Older));
        assert_eq!(version(tmp.path()), LATEST_VERSION - 1);
    }

    #[test]
    fn data_dir_is_the_shared_folder_unless_the_environment_says_otherwise() {
        // Tests run with STRATA_DATA_DIR unset; setting it here would race with other tests.
        assert_eq!(
            data_dir(Path::new("C:/Users/x/AppData/Roaming")),
            PathBuf::from("C:/Users/x/AppData/Roaming").join("Strata")
        );
    }

    /// Not a test: writes a made-up set of borewells for trying the app by hand.
    /// `STRATA_SEED_DIR=<empty folder> cargo test -p stratavision seed_for_manual_runs -- --ignored`,
    /// then start the app with `STRATA_DATA_DIR` set to the same folder.
    #[test]
    #[ignore]
    fn seed_for_manual_runs() {
        let dir = PathBuf::from(std::env::var_os("STRATA_SEED_DIR").expect("set STRATA_SEED_DIR"));
        assert!(
            !dir.join(DB_FILE_NAME).exists(),
            "refusing to add made-up borewells to records that already exist"
        );
        let (db, _) = Database::open(&dir).unwrap();
        db.with_tx(|tx| {
            // A 5 by 5 grid across Lucknow (the middle one is at the city centre), plus two
            // borewells whose location was never recorded.
            for i in 0..27 {
                let located = i < 25;
                repo::create_with_layers(
                    tx,
                    &BorewellInput {
                        borewell_id: format!("BW-{:03}", i + 1),
                        area: "Made-up area".into(),
                        latitude: located.then_some(26.75 + 0.05 * (i / 5) as f64),
                        longitude: located.then_some(80.85 + 0.05 * (i % 5) as f64),
                        total_depth: Some(200.0 + 10.0 * i as f64),
                        ..Default::default()
                    },
                    &[],
                    &[],
                )?;
            }
            Ok(())
        })
        .unwrap();
    }
}
