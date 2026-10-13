mod data;

use tauri::Manager;

/// Every borewell in StrataField's records, read afresh each time the screens ask.
#[tauri::command]
fn load_data(app: tauri::AppHandle) -> Result<Vec<data::SiteRecord>, data::LoadError> {
    let roaming = app.path().data_dir()?;
    data::load(&data::data_dir(&roaming))
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_data])
        .run(tauri::generate_context!())
        .expect("StrataVision could not start");
}
