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
        .setup(|app| Ok(open_main_window(app)?))
        .invoke_handler(tauri::generate_handler![load_data])
        .run(tauri::generate_context!())
        .expect("StrataVision could not start");
}

/// Opens the main window described in tauri.conf.json (which has `create: false` so that it is
/// opened here, where a development build can add the start-up test's debugging port).
fn open_main_window(app: &mut tauri::App) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .expect("tauri.conf.json describes the main window");
    #[allow(unused_mut)]
    let mut window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?;
    // Development builds only: the start-up test (e2e/) sets STRATA_E2E_DEBUG_PORT to read the
    // window through WebView2's debugging port. Installed (release) builds ignore it. The
    // WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS variable is not enough: CI runners ignore it.
    #[cfg(debug_assertions)]
    if let Ok(port) = std::env::var("STRATA_E2E_DEBUG_PORT") {
        if let Ok(port) = port.parse::<u16>() {
            window = window.additional_browser_args(&format!(
                "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port={port}"
            ));
        }
    }
    window.build()?;
    Ok(())
}
