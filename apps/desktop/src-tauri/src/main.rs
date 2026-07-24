// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod nodejs;
mod server;
mod settings;

use std::process::Child;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItemBuilder, SubmenuBuilder};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use server::BootPaths;

#[derive(Default)]
struct ServerState {
    child: Mutex<Option<Child>>,
    data_dir: Mutex<Option<std::path::PathBuf>>,
    /// The local server URL once booted — reused when switching modes.
    local_url: Mutex<Option<String>>,
    shutting_down: AtomicBool,
    restarts: AtomicU8,
}

/// Origin of the bundled splash page (frontendDist via the app protocol).
fn splash_url(query: &str) -> String {
    let base = if cfg!(windows) { "http://tauri.localhost" } else { "tauri://localhost" };
    if query.is_empty() {
        format!("{base}/index.html")
    } else {
        format!("{base}/index.html?{query}")
    }
}

fn navigate(app: &tauri::AppHandle, url: &str) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(parsed) = url.parse() {
            let _ = window.navigate(parsed);
        }
    }
}

fn fail(app: &tauri::AppHandle, message: &str) {
    app.dialog()
        .message(message)
        .kind(MessageDialogKind::Error)
        .title("specpasa could not start")
        .blocking_show();
    app.exit(1);
}

/// Any HTTP reply counts as reachable — auth walls and redirects included.
fn remote_reachable(url: &str) -> bool {
    let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(5)).build();
    matches!(agent.get(url).call(), Ok(_) | Err(ureq::Error::Status(..)))
}

/// Boot the bundled local server (once) and return its URL.
fn boot(app: &tauri::AppHandle) -> Result<String, String> {
    {
        let state = app.state::<ServerState>();
        let existing = state.local_url.lock().unwrap().clone();
        let alive = state.child.lock().unwrap().is_some();
        if let (Some(url), true) = (existing, alive) {
            return Ok(url);
        }
        state.shutting_down.store(false, Ordering::SeqCst);
        state.restarts.store(0, Ordering::SeqCst);
    }

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let paths = BootPaths { server_dir: resource_dir.join("server"), data_dir: data_dir.clone() };

    server::kill_orphan(&paths.data_dir);
    let secret = server::load_or_create_secret(&paths.data_dir).map_err(|e| e.to_string())?;
    let path_env = nodejs::enriched_path();
    let node = nodejs::find_node(&path_env)?;
    server::migrate(&node, &paths, &path_env)?;

    let port = server::pick_port();
    let child =
        server::spawn_server(&node, &paths, port, &secret, &path_env).map_err(|e| e.to_string())?;

    let url = format!("http://127.0.0.1:{port}/");
    {
        let state = app.state::<ServerState>();
        *state.child.lock().unwrap() = Some(child);
        *state.data_dir.lock().unwrap() = Some(data_dir);
        *state.local_url.lock().unwrap() = Some(url.clone());
    }

    if !server::wait_ready(port) {
        shutdown(app);
        return Err(
            "The local server did not become ready — see logs/server.log in the app data folder."
                .into(),
        );
    }

    monitor(app.clone(), node, paths, port, secret, path_env);
    Ok(url)
}

/// Watch the server; restart once on an unexpected exit, then give up with a
/// dialog. A second thread is spawned per restart.
fn monitor(
    app: tauri::AppHandle,
    node: std::path::PathBuf,
    paths: BootPaths,
    port: u16,
    secret: String,
    path_env: String,
) {
    std::thread::spawn(move || {
        loop {
            let exited = {
                let state = app.state::<ServerState>();
                let mut guard = state.child.lock().unwrap();
                match guard.as_mut() {
                    None => return,
                    Some(child) => matches!(child.try_wait(), Ok(Some(_))),
                }
            };
            if !exited {
                std::thread::sleep(std::time::Duration::from_secs(1));
                continue;
            }
            let state = app.state::<ServerState>();
            if state.shutting_down.load(Ordering::SeqCst) {
                return;
            }
            if state.restarts.fetch_add(1, Ordering::SeqCst) >= 1 {
                let data_dir = state.data_dir.lock().unwrap().clone();
                let log = data_dir
                    .map(|d| d.join("logs/server.log").display().to_string())
                    .unwrap_or_default();
                app.dialog()
                    .message(format!("The specpasa server stopped unexpectedly. See log: {log}"))
                    .kind(MessageDialogKind::Error)
                    .title("specpasa")
                    .blocking_show();
                app.exit(1);
                return;
            }
            match server::spawn_server(&node, &paths, port, &secret, &path_env) {
                Ok(child) => {
                    *state.child.lock().unwrap() = Some(child);
                    if !server::wait_ready(port) {
                        continue; // will hit the restart cap next loop
                    }
                }
                Err(_) => continue,
            }
        }
    });
}

fn shutdown(app: &tauri::AppHandle) {
    let state = app.state::<ServerState>();
    state.shutting_down.store(true, Ordering::SeqCst);
    let data_dir = state.data_dir.lock().unwrap().clone();
    let taken = state.child.lock().unwrap().take();
    *state.local_url.lock().unwrap() = None;
    if let (Some(mut child), Some(dir)) = (taken, data_dir) {
        server::stop_server(&mut child, &dir);
    }
}

/// Route the window to whatever the settings say: a self-hosted server, or
/// the bundled local one. Runs on a background thread — boot and health
/// checks block.
fn apply_mode(app: &tauri::AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || match settings::load(&handle).server_url {
        Some(remote) => {
            if remote_reachable(&remote) {
                // The local server is not needed while pointed elsewhere.
                shutdown(&handle);
                navigate(&handle, &remote);
            } else {
                let encoded: String = remote
                    .chars()
                    .map(|c| if c == '&' { "%26".to_string() } else { c.to_string() })
                    .collect();
                navigate(&handle, &splash_url(&format!("error=unreachable&url={encoded}")));
            }
        }
        None => match boot(&handle) {
            Ok(url) => navigate(&handle, &url),
            Err(message) => fail(&handle, &message),
        },
    });
}

#[tauri::command]
fn get_server_url(app: tauri::AppHandle) -> Option<String> {
    settings::load(&app).server_url
}

/// Splash-form entry point: `url` = self-hosted base URL, or null to return
/// to the bundled local server.
#[tauri::command]
fn set_server_url(app: tauri::AppHandle, url: Option<String>) -> Result<(), String> {
    let normalized = match url {
        Some(raw) => Some(settings::normalize_url(&raw).ok_or("Enter an http(s):// URL")?),
        None => None,
    };
    settings::save(&app, &settings::Settings { server_url: normalized })?;
    navigate(&app, &splash_url(""));
    apply_mode(&app);
    Ok(())
}

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    let connect = MenuItemBuilder::with_id("server-connect", "Connect to Self-Hosted Server…")
        .build(app)?;
    let local = MenuItemBuilder::with_id("server-local", "Use Local Server").build(app)?;
    let submenu = SubmenuBuilder::new(app, "Server").item(&connect).item(&local).build()?;
    // Extend the default menu so Edit (copy/paste) keeps working in the webview.
    let menu = Menu::default(app)?;
    menu.append(&submenu)?;
    app.set_menu(menu)?;
    Ok(())
}

fn on_menu(app: &tauri::AppHandle, id: &str) {
    match id {
        "server-connect" => {
            if cfg!(debug_assertions) {
                app.dialog().message("Server switching runs in release builds.").blocking_show();
                return;
            }
            navigate(app, &splash_url("configure=1"));
        }
        "server-local" => {
            if cfg!(debug_assertions) {
                return;
            }
            let _ = settings::save(app, &settings::Settings { server_url: None });
            navigate(app, &splash_url(""));
            apply_mode(app);
        }
        _ => {}
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(ServerState::default())
        .invoke_handler(tauri::generate_handler![get_server_url, set_server_url])
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .setup(|app| {
            build_menu(app.handle())?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("specpasa")
                .inner_size(1280.0, 800.0)
                .build()?;

            // Dev builds: WebviewUrl::App resolves to devUrl (astro dev on
            // :4321) — no server management, hot-reload works as usual.
            if !cfg!(debug_assertions) {
                apply_mode(app.handle());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building specpasa desktop");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            shutdown(app);
        }
    });
}
