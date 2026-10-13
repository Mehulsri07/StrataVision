//! Reading StrataField's records. StrataVision only ever reads: it never writes to the database,
//! never upgrades it and never creates the data folder.

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use strata_db::db::DB_FILE_NAME;
use strata_db::models::{Borewell, PipeSegment, SearchFilters, StrataLayer, WaterReading};
use strata_db::repo::{borewells, layers};
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

/// Every borewell that is not in the Recycle bin, read from `<data_dir>/strata.db` as it is at
/// this moment. The file is opened read-only and nothing is created, upgraded or changed.
pub fn load(data_dir: &Path) -> Result<Vec<SiteRecord>, LoadError> {
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
    Ok(sites)
}

#[cfg(test)]
mod tests {
    use super::*;
    use strata_db::models::BorewellInput;
    use strata_db::schema::{current_version, LATEST_VERSION};
    use strata_db::{repo, Database};

    /// A real database, made the way StrataField makes it, holding borewell BW-1 with one layer.
    fn seeded(dir: &Path) -> Database {
        let (db, _) = Database::open(dir).unwrap();
        db.with_tx(|tx| {
            repo::create_with_layers(
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
                &[],
            )
        })
        .unwrap();
        db
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
        let got = load(tmp.path()).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].borewell.borewell_id, "BW-1");
        assert_eq!(got[0].strata.len(), 1);
    }

    #[test]
    fn loads_while_another_app_has_it_open() {
        let tmp = tempfile::tempdir().unwrap();
        let _open = seeded(tmp.path());
        assert_eq!(load(tmp.path()).unwrap().len(), 1);
    }

    #[test]
    fn recycle_bin_is_left_out() {
        let tmp = tempfile::tempdir().unwrap();
        let db = seeded(tmp.path());
        db.with_tx(|tx| {
            let id = repo::borewells::search(tx, &Default::default())?[0]
                .borewell
                .id
                .clone();
            repo::borewells::soft_delete(tx, &id)
        })
        .unwrap();
        drop(db);
        assert_eq!(load(tmp.path()).unwrap().len(), 0);
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
}
