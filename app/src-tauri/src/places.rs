//! Finding a place in Lucknow by name, with OpenStreetMap's place finder (Nominatim). Asked from
//! here rather than from the window so it can say who is asking, as Nominatim's rules require.

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Around Lucknow: west, north, east, south.
const LUCKNOW: &str = "80.70,27.10,81.20,26.60";
const WHO: &str = concat!(
    "StrataVision/",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/Mehulsri07/StrataVision)"
);

#[derive(Serialize, Debug)]
pub struct Place {
    pub name: String,
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(Deserialize)]
struct Found {
    display_name: String,
    lat: String,
    lon: String,
}

/// Up to six places in and around Lucknow matching `query`. Fails without internet.
pub fn find(query: &str) -> Result<Vec<Place>, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(10)))
        .build()
        .into();
    let found: Vec<Found> = agent
        .get("https://nominatim.openstreetmap.org/search")
        .query("q", query)
        .query("format", "jsonv2")
        .query("viewbox", LUCKNOW)
        .query("bounded", "1")
        .query("limit", "6")
        .header("User-Agent", WHO)
        .call()
        .and_then(|mut r| r.body_mut().read_json())
        .map_err(|e| e.to_string())?;
    Ok(found
        .into_iter()
        .filter_map(|f| {
            Some(Place {
                name: f.display_name,
                latitude: f.lat.parse().ok()?,
                longitude: f.lon.parse().ok()?,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    /// Needs internet, so run by hand: cargo test -p stratavision finds_a_locality -- --ignored
    #[test]
    #[ignore]
    fn finds_a_locality() {
        let found = super::find("Gomti Nagar").unwrap();
        assert!(!found.is_empty());
        assert!(found
            .iter()
            .all(|p| (26.6..27.1).contains(&p.latitude) && (80.7..81.2).contains(&p.longitude)));
    }
}
