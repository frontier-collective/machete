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
                // Only emit when meaningful changes occur:
                // - Working tree files (anything NOT under .git/)
                // - .git/HEAD (branch switch)
                // - .git/refs/ (new commits, tags, remote updates)
                // Ignore everything else inside .git/ — especially .git/index
                // which is written by `git status` itself (stat cache refresh),
                // creating a feedback loop: status → index write → watcher → status → ...
                let has_meaningful_change = events.iter().any(|e| {
                    if e.kind != DebouncedEventKind::Any {
                        return false;
                    }
                    let p = e.path.to_string_lossy();
                    if !p.contains("/.git/") {
                        // Working tree change
                        return true;
                    }
                    // Inside .git/ — only care about HEAD and refs
                    if p.ends_with("/.git/HEAD") || p.contains("/.git/refs/") {
                        return true;
                    }
                    false
                });

                if has_meaningful_change {
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
