use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Global state holding the current watcher so we can stop it when the repo changes.
pub struct WatcherState {
    /// Dropping the debouncer stops the watcher.
    _debouncer: Option<notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self { _debouncer: None }
    }
}

/// Start watching a repo directory for file changes.
/// Emits "repo-fs-changed" events to the frontend (debounced to 500ms).
#[tauri::command]
pub async fn watch_repo(app: AppHandle, repo_path: String) -> Result<(), String> {
    let path = PathBuf::from(&repo_path);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }

    let app_handle = app.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        move |events: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            if let Ok(events) = events {
                // Filter out .git/objects and .git/logs noise — only care about
                // working tree changes, .git/index, .git/HEAD, .git/refs
                let dominated_by_git_internals = events.iter().all(|e| {
                    if e.kind != DebouncedEventKind::Any {
                        return true;
                    }
                    let p = e.path.to_string_lossy();
                    // .git/objects, .git/logs, .git/COMMIT_EDITMSG etc. are noise
                    (p.contains("/.git/objects/")
                        || p.contains("/.git/logs/")
                        || p.contains("/.git/COMMIT_EDITMSG"))
                        && !p.contains("/.git/index")
                        && !p.contains("/.git/HEAD")
                        && !p.contains("/.git/refs/")
                });

                if !dominated_by_git_internals {
                    let _ = app_handle.emit("repo-fs-changed", ());
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Watch the repo recursively
    debouncer
        .watcher()
        .watch(&path, notify::RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch path: {}", e))?;

    // Store in app state, dropping the previous watcher
    let state = app.state::<Mutex<WatcherState>>();
    let mut guard = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    guard._debouncer = Some(debouncer);

    Ok(())
}

/// Stop watching the current repo.
#[tauri::command]
pub async fn unwatch_repo(app: AppHandle) -> Result<(), String> {
    let state = app.state::<Mutex<WatcherState>>();
    let mut guard = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    guard._debouncer = None;
    Ok(())
}
