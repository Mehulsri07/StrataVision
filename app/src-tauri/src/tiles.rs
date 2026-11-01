//! OpenStreetMap's map tiles, kept on this computer as they are shown, so the maps still have their
//! streets without internet wherever they were looked at before. The window asks for
//! `tiles://localhost/{z}/{x}/{y}.png`; a kept tile is used while it is fresh, a new one is fetched
//! otherwise, and a stale one is better than none when the fetch fails.
//!
//! OpenStreetMap's tile rules forbid downloading areas in bulk, so nothing is fetched ahead of use.

use std::path::Path;
use std::time::Duration;
use tauri::http::{Response, StatusCode};

/// How long a kept tile is used before asking for it again (OpenStreetMap asks for at least 7 days).
const FRESH_FOR: Duration = Duration::from_secs(30 * 24 * 3600);
const WHO: &str = concat!(
    "StrataVision/",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/Mehulsri07/StrataVision)"
);

/// `/z/x/y.png` as numbers, or None for anything else (so no other path can be read).
fn parse(path: &str) -> Option<(u32, u32, u32)> {
    let mut parts = path
        .trim_start_matches('/')
        .strip_suffix(".png")?
        .split('/');
    let mut next = || parts.next()?.parse::<u32>().ok();
    let (z, x, y) = (next()?, next()?, next()?);
    (parts.next().is_none() && z <= 19).then_some((z, x, y))
}

fn fetch(z: u32, x: u32, y: u32) -> Result<Vec<u8>, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(10)))
        .build()
        .into();
    agent
        .get(&format!("https://tile.openstreetmap.org/{z}/{x}/{y}.png"))
        .header("User-Agent", WHO)
        .call()
        .and_then(|mut r| r.body_mut().with_config().limit(2 << 20).read_to_vec())
        .map_err(|e| e.to_string())
}

/// The tile at `path`, from `cache` or from `get`, kept in `cache` when fetched.
pub fn serve(
    cache: &Path,
    path: &str,
    get: impl Fn(u32, u32, u32) -> Result<Vec<u8>, String>,
) -> Response<Vec<u8>> {
    let respond = |status: StatusCode, body: Vec<u8>| {
        Response::builder()
            .status(status)
            .header("Content-Type", "image/png")
            .header("Access-Control-Allow-Origin", "*")
            .body(body)
            .unwrap()
    };
    let Some((z, x, y)) = parse(path) else {
        return respond(StatusCode::NOT_FOUND, Vec::new());
    };
    let file = cache.join(format!("{z}/{x}/{y}.png"));
    let kept = std::fs::read(&file).ok();
    let fresh = std::fs::metadata(&file)
        .and_then(|m| m.modified())
        .is_ok_and(|t| t.elapsed().is_ok_and(|age| age < FRESH_FOR));
    if let (Some(body), true) = (&kept, fresh) {
        return respond(StatusCode::OK, body.clone());
    }
    match get(z, x, y) {
        Ok(body) => {
            // ponytail: the folder only grows (about 20 KB a tile); clear it if it ever gets large.
            if std::fs::create_dir_all(file.parent().unwrap()).is_ok() {
                let _ = std::fs::write(&file, &body);
            }
            respond(StatusCode::OK, body)
        }
        Err(_) => match kept {
            Some(body) => respond(StatusCode::OK, body),
            None => respond(StatusCode::NOT_FOUND, Vec::new()),
        },
    }
}

/// The tile at `path`, fetched from OpenStreetMap when not kept fresh in `cache`.
pub fn tile(cache: &Path, path: &str) -> Response<Vec<u8>> {
    serve(cache, path, fetch)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn reads_only_tile_paths() {
        assert_eq!(parse("/12/2950/1714.png"), Some((12, 2950, 1714)));
        for bad in [
            "/12/2950/1714",
            "/../x/1/2.png",
            "/12/1/2/3.png",
            "/25/1/2.png",
            "/a/b/c.png",
        ] {
            assert_eq!(parse(bad), None, "{bad}");
        }
    }

    #[test]
    fn keeps_a_tile_and_uses_it_without_asking_again() {
        let tmp = tempfile::tempdir().unwrap();
        let asked = Cell::new(0);
        let get = |_, _, _| {
            asked.set(asked.get() + 1);
            Ok(b"png".to_vec())
        };
        assert_eq!(serve(tmp.path(), "/12/1/2.png", get).body(), b"png");
        assert_eq!(serve(tmp.path(), "/12/1/2.png", get).body(), b"png");
        assert_eq!(asked.get(), 1);
    }

    #[test]
    fn without_internet_uses_a_stale_tile_or_none() {
        let tmp = tempfile::tempdir().unwrap();
        let offline = |_, _, _| Err("no internet".to_string());
        assert_eq!(
            serve(tmp.path(), "/12/1/2.png", offline).status(),
            StatusCode::NOT_FOUND
        );
        let file = tmp.path().join("12/1/3.png");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, b"old").unwrap();
        let long_ago = std::time::SystemTime::now() - FRESH_FOR * 2;
        std::fs::File::options()
            .write(true)
            .open(&file)
            .unwrap()
            .set_modified(long_ago)
            .unwrap();
        assert_eq!(serve(tmp.path(), "/12/1/3.png", offline).body(), b"old");
    }
}
