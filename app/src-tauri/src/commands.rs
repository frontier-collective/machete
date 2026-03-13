use std::process::Command;
use serde_json::Value;

/// Strip ANSI escape codes from CLI output so errors display cleanly in the GUI.
fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // Skip until we hit a letter (end of escape sequence)
            for c2 in chars.by_ref() {
                if c2.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            result.push(c);
        }
    }
    result
}

/// Resolve the machete CLI entry point.
/// In dev: use `node <repo>/dist/index.js` (the locally-built CLI with --json support).
/// In production: use the globally-installed `machete` binary.
fn machete_command() -> (String, Vec<String>) {
    // Check for the dev build relative to this binary's location
    // Binary is at: app/src-tauri/target/{debug,release}/machete-app
    // CLI dist is at: dist/index.js (repo root)
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));

    if let Some(dir) = exe_dir {
        // Walk up from target/{debug,release}/ to repo root
        // app/src-tauri/target/debug -> app/src-tauri/target -> app/src-tauri -> app -> repo root
        let repo_root = dir.join("../../../../");
        let cli_entry = repo_root.join("dist/index.js").canonicalize();
        if let Ok(entry) = cli_entry {
            return (
                "node".to_string(),
                vec![entry.to_string_lossy().to_string()],
            );
        }
    }

    // Fallback: use globally installed machete
    ("machete".to_string(), vec![])
}

/// Run `machete <args> --json` in the given repo directory and parse JSON output.
fn run_machete(repo_path: &str, args: &[&str]) -> Result<Value, String> {
    let (program, prefix_args) = machete_command();
    let mut cmd_args: Vec<String> = prefix_args;
    for a in args {
        cmd_args.push(a.to_string());
    }
    cmd_args.push("--json".to_string());

    let output = Command::new(&program)
        .args(&cmd_args)
        .current_dir(repo_path)
        .env("PATH", enriched_path())
        .output()
        .map_err(|e| format!("Failed to run machete ({}): {}", program, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        // Try to parse stdout as JSON error
        if let Ok(val) = serde_json::from_str::<Value>(&stdout) {
            if let Some(err) = val.get("error").and_then(|e| e.as_str()) {
                return Err(err.to_string());
            }
        }
        return Err(strip_ansi(&format!("machete failed: {}", stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse JSON: {}", e))
}

/// Build a PATH that includes common binary locations.
fn enriched_path() -> String {
    format!(
        "/opt/homebrew/bin:/usr/local/bin:{}",
        std::env::var("PATH").unwrap_or_default()
    )
}

/// Run a raw git command in the given repo directory.
fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .env("PATH", enriched_path())
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(strip_ansi(&format!("git failed: {}", stderr)));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// ─── Status ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_repo_status(repo_path: String) -> Result<Value, String> {
    run_machete(&repo_path, &["status"])
}

// ─── Commit ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_commit_context(repo_path: String) -> Result<Value, String> {
    run_machete(&repo_path, &["commit"])
}

#[tauri::command]
pub async fn generate_commit_message(repo_path: String) -> Result<Value, String> {
    run_machete(&repo_path, &["commit", "--generate"])
}

#[tauri::command]
pub async fn create_commit(repo_path: String, message: String) -> Result<String, String> {
    run_git(&repo_path, &["commit", "-m", &message])?;
    Ok("Committed successfully".to_string())
}

#[tauri::command]
pub async fn stage_files(repo_path: String, files: Vec<String>) -> Result<String, String> {
    let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
    let mut args = vec!["add"];
    args.extend(file_refs);
    run_git(&repo_path, &args)?;
    Ok("Staged".to_string())
}

#[tauri::command]
pub async fn unstage_files(repo_path: String, files: Vec<String>) -> Result<String, String> {
    let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
    let mut args = vec!["reset", "HEAD"];
    args.extend(file_refs);
    run_git(&repo_path, &args)?;
    Ok("Unstaged".to_string())
}

#[tauri::command]
pub async fn get_file_diff(repo_path: String, file: String, staged: bool) -> Result<String, String> {
    if staged {
        run_git(&repo_path, &["diff", "--cached", "--", &file])
    } else {
        run_git(&repo_path, &["diff", "--", &file])
    }
}

#[tauri::command]
pub async fn push_current_branch(repo_path: String) -> Result<String, String> {
    let branch = run_git(&repo_path, &["branch", "--show-current"])?;
    run_git(&repo_path, &["push", "-u", "origin", &branch])?;
    Ok(format!("Pushed {}", branch))
}

// ─── Prune ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_branch_classification(repo_path: String) -> Result<Value, String> {
    run_machete(&repo_path, &["prune", "--dry-run"])
}

#[tauri::command]
pub async fn delete_branches(repo_path: String, branches: Vec<String>) -> Result<Vec<String>, String> {
    let mut deleted = Vec::new();
    for branch in &branches {
        match run_git(&repo_path, &["branch", "-d", branch]) {
            Ok(_) => deleted.push(branch.clone()),
            Err(e) => return Err(format!("Failed to delete {}: {}", branch, e)),
        }
    }
    Ok(deleted)
}

// ─── PR ─────────────────────────────────────────────────────────────

/// Detect the default base branch: prBaseBranch config → remote default → "main"
#[tauri::command]
pub async fn get_default_base_branch(repo_path: String) -> Result<String, String> {
    // 1. Check machete config for prBaseBranch
    if let Ok(config) = run_machete(&repo_path, &["config", "--list"]) {
        if let Some(entries) = config.as_array() {
            for entry in entries {
                if entry.get("key").and_then(|k| k.as_str()) == Some("prBaseBranch") {
                    if let Some(val) = entry.get("value").and_then(|v| v.as_str()) {
                        if !val.is_empty() {
                            return Ok(val.to_string());
                        }
                    }
                }
            }
        }
    }

    // 2. Try remote default branch
    if let Ok(output) = run_git(&repo_path, &["remote", "show", "origin"]) {
        for line in output.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("HEAD branch:") {
                let branch = trimmed.trim_start_matches("HEAD branch:").trim();
                if !branch.is_empty() && branch != "(unknown)" {
                    return Ok(branch.to_string());
                }
            }
        }
    }

    // 3. Fallback
    Ok("main".to_string())
}

#[tauri::command]
pub async fn get_pr_context(repo_path: String, base: String) -> Result<Value, String> {
    run_machete(&repo_path, &["pr", "--base", &base])
}

#[tauri::command]
pub async fn generate_pr(repo_path: String, base: String) -> Result<Value, String> {
    run_machete(&repo_path, &["pr", "--base", &base, "--generate"])
}

#[tauri::command]
pub async fn create_pr(
    repo_path: String,
    title: String,
    body: String,
    base: String,
    draft: bool,
) -> Result<String, String> {
    let mut args = vec!["pr", "create", "--base", &base, "--title", &title, "--body", &body];
    if draft {
        args.push("--draft");
    }

    let output = Command::new("gh")
        .args(&args)
        .current_dir(&repo_path)
        .env("PATH", enriched_path())
        .output()
        .map_err(|e| format!("Failed to run gh: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(strip_ansi(&format!("gh pr create failed: {}", stderr)));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// ─── Release ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_release_preview(repo_path: String) -> Result<Value, String> {
    run_machete(&repo_path, &["release"])
}

// ─── Config ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_config_list(repo_path: String) -> Result<Value, String> {
    run_machete(&repo_path, &["config", "--list"])
}

#[tauri::command]
pub async fn set_config_value(
    repo_path: String,
    key: String,
    value: String,
    global: bool,
) -> Result<String, String> {
    let mut args = vec!["config"];
    if global {
        args.push("-g");
    }
    args.push(&key);
    args.push(&value);

    let (program, prefix_args) = machete_command();
    let mut full_args: Vec<String> = prefix_args;
    for a in &args {
        full_args.push(a.to_string());
    }

    let output = Command::new(&program)
        .args(&full_args)
        .current_dir(&repo_path)
        .env("PATH", enriched_path())
        .output()
        .map_err(|e| format!("Failed to run machete: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(strip_ansi(&format!("machete config failed: {}", stderr)));
    }

    Ok("Config updated".to_string())
}
