mod commands;
mod watcher;

use std::sync::Mutex;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(Mutex::new(watcher::WatcherState::default()))
        .invoke_handler(tauri::generate_handler![
            commands::get_repo_status,
            commands::get_commit_context,
            commands::generate_commit_message,
            commands::create_commit,
            commands::stage_files,
            commands::unstage_files,
            commands::get_file_diff,
            commands::push_current_branch,
            commands::pull_current_branch,
            commands::fetch_remote,
            commands::create_branch,
            commands::get_branch_classification,
            commands::delete_branches,
            commands::delete_branch,
            commands::get_default_base_branch,
            commands::get_pr_context,
            commands::generate_pr,
            commands::create_pr,
            commands::list_prs,
            commands::get_release_preview,
            commands::get_config_list,
            commands::set_config_value,
            commands::get_branches,
            commands::get_remotes,
            commands::get_tags,
            commands::get_commit_log,
            commands::checkout_branch,
            commands::get_next_story_id,
            commands::merge_preview,
            commands::merge_branch,
            commands::rebase_branch,
            commands::get_conflict_files,
            commands::resolve_conflict,
            commands::abort_merge_or_rebase,
            commands::continue_merge_or_rebase,
            commands::check_merge_state,
            commands::get_commit_detail,
            commands::list_stashes,
            commands::create_stash,
            commands::apply_stash,
            commands::drop_stash,
            commands::cherry_pick,
            commands::health_check,
            watcher::watch_repo,
            watcher::unwatch_repo,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Persist window state on quit / SIGTERM / SIGINT
                let _ = app.save_window_state(StateFlags::all());
            }
        });
}
