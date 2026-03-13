mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_repo_status,
            commands::get_commit_context,
            commands::generate_commit_message,
            commands::create_commit,
            commands::stage_files,
            commands::unstage_files,
            commands::get_file_diff,
            commands::push_current_branch,
            commands::get_branch_classification,
            commands::delete_branches,
            commands::get_default_base_branch,
            commands::get_pr_context,
            commands::generate_pr,
            commands::create_pr,
            commands::get_release_preview,
            commands::get_config_list,
            commands::set_config_value,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
