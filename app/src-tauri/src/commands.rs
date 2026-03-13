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
    // Check if HEAD exists (it won't in a brand-new repo with no commits)
    let has_head = run_git(&repo_path, &["rev-parse", "HEAD"]).is_ok();
    if has_head {
        let mut args = vec!["reset", "HEAD", "--"];
        args.extend(file_refs);
        run_git(&repo_path, &args)?;
    } else {
        // No commits yet — use rm --cached to unstage
        let mut args = vec!["rm", "--cached", "--"];
        args.extend(file_refs);
        run_git(&repo_path, &args)?;
    }
    Ok("Unstaged".to_string())
}

#[tauri::command]
pub async fn get_file_diff(
    repo_path: String,
    file: String,
    staged: bool,
    commit_hash: Option<String>,
    context_lines: Option<u32>,
) -> Result<String, String> {
    let ctx = format!("-U{}", context_lines.unwrap_or(3));

    if let Some(hash) = commit_hash {
        // Check if this commit has a parent (root commits don't)
        let has_parent = run_git(&repo_path, &["rev-parse", &format!("{}^", hash)]).is_ok();
        let parent = if has_parent {
            format!("{}^", hash)
        } else {
            // Empty tree hash — diff entire commit against nothing
            "4b825dc642cb6eb9a060e54bf899d15f3f9382e1".to_string()
        };
        if file.contains(" → ") {
            let parts: Vec<&str> = file.split(" → ").collect();
            let old_file = parts[0].trim();
            let new_file = parts[1].trim();
            run_git(&repo_path, &["diff", "-M", &ctx, &parent, &hash, "--", old_file, new_file])
        } else {
            run_git(&repo_path, &["diff", "-M", &ctx, &parent, &hash, "--", &file])
        }
    } else if staged {
        run_git(&repo_path, &["diff", "--cached", &ctx, "--", &file])
    } else {
        run_git(&repo_path, &["diff", &ctx, "--", &file])
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

// ─── Sidebar data (branches, remotes, tags) ─────────────────────────

#[tauri::command]
pub async fn get_branches(repo_path: String) -> Result<Value, String> {
    // Local branches with current marker and ahead/behind tracking info
    let current = run_git(&repo_path, &["branch", "--show-current"])?;
    let output = run_git(
        &repo_path,
        &[
            "for-each-ref",
            "--format=%(refname:short)|%(upstream:track)",
            "refs/heads/",
        ],
    )?;
    let branches: Vec<Value> = output
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.splitn(2, '|').collect();
            let name = parts[0].trim();
            let track = parts.get(1).unwrap_or(&"").trim();

            // Parse "[ahead N, behind M]" or "[ahead N]" or "[behind M]"
            let mut ahead: u64 = 0;
            let mut behind: u64 = 0;
            if track.starts_with('[') && track.ends_with(']') {
                let inner = &track[1..track.len() - 1];
                for part in inner.split(',') {
                    let part = part.trim();
                    if part.starts_with("ahead ") {
                        ahead = part[6..].parse().unwrap_or(0);
                    } else if part.starts_with("behind ") {
                        behind = part[7..].parse().unwrap_or(0);
                    }
                }
            }

            serde_json::json!({
                "name": name,
                "current": name == current,
                "ahead": ahead,
                "behind": behind,
            })
        })
        .collect();
    Ok(serde_json::json!(branches))
}

#[tauri::command]
pub async fn get_remotes(repo_path: String) -> Result<Value, String> {
    let remotes_out = run_git(&repo_path, &["remote"])?;
    let mut remotes: Vec<Value> = Vec::new();

    for remote in remotes_out.lines().filter(|l| !l.is_empty()) {
        let remote = remote.trim();
        // Get remote branches
        let refs_out = run_git(
            &repo_path,
            &["branch", "-r", "--format=%(refname:short)", "--list", &format!("{}/*", remote)],
        )
        .unwrap_or_default();

        let branches: Vec<String> = refs_out
            .lines()
            .filter(|l| !l.is_empty() && !l.contains("HEAD"))
            .map(|l| l.trim().to_string())
            .collect();

        remotes.push(serde_json::json!({
            "name": remote,
            "branches": branches,
        }));
    }

    Ok(serde_json::json!(remotes))
}

#[tauri::command]
pub async fn get_tags(repo_path: String) -> Result<Value, String> {
    let output = run_git(&repo_path, &["tag", "--sort=-creatordate"]).unwrap_or_default();
    let tags: Vec<String> = output
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.trim().to_string())
        .collect();
    Ok(serde_json::json!(tags))
}

// ─── Commit log ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_commit_log(repo_path: String, count: Option<u32>) -> Result<Value, String> {
    let n = count.unwrap_or(100);
    // %H=hash %h=short %P=parents %s=subject %an=author %aI=date %D=refs
    let format = "--format=%H%n%h%n%P%n%s%n%an%n%aI%n%D%n---";
    let output = run_git(&repo_path, &["log", &format!("-{}", n), format, "--all"])?;

    let mut commits: Vec<Value> = Vec::new();
    let mut lines: Vec<&str> = Vec::new();

    for line in output.lines() {
        if line == "---" {
            if lines.len() >= 7 {
                let parents_str = lines[2];
                let parents: Vec<String> = if parents_str.is_empty() {
                    vec![]
                } else {
                    parents_str.split(' ').map(|s| s.to_string()).collect()
                };
                let refs_str = lines[6];
                let refs: Vec<String> = if refs_str.is_empty() {
                    vec![]
                } else {
                    refs_str.split(", ").map(|s| s.trim().to_string()).collect()
                };
                commits.push(serde_json::json!({
                    "hash": lines[0],
                    "shortHash": lines[1],
                    "parents": parents,
                    "message": lines[3],
                    "author": lines[4],
                    "date": lines[5],
                    "refs": refs,
                }));
            }
            lines.clear();
        } else {
            lines.push(line);
        }
    }

    Ok(serde_json::json!(commits))
}

// ─── Branch checkout ─────────────────────────────────────────────────

#[tauri::command]
pub async fn checkout_branch(repo_path: String, branch: String) -> Result<String, String> {
    run_git(&repo_path, &["checkout", &branch])?;
    Ok(format!("Switched to {}", branch))
}

// ─── Commit detail (for viewing a historical commit) ────────────────

#[tauri::command]
pub async fn get_commit_detail(repo_path: String, hash: String) -> Result<Value, String> {
    // Get commit message
    let message = run_git(&repo_path, &["log", "-1", "--format=%B", &hash])?;

    // Check if this is a merge commit (multiple parents)
    let parents = run_git(&repo_path, &["rev-parse", &format!("{}^@", hash)])?;
    let parent_count = parents.lines().filter(|l| !l.is_empty()).count();

    // Get file stats and status: -M enables rename detection, -C enables copy detection
    let (numstat, name_status) = if parent_count > 1 {
        let first_parent = parents.lines().next().unwrap_or("").trim();
        (
            run_git(&repo_path, &["diff", "-M", "-C", "--numstat", first_parent, &hash])?,
            run_git(&repo_path, &["diff", "-M", "-C", "--name-status", first_parent, &hash])?,
        )
    } else if parent_count == 0 {
        // Root commit (no parents) — need --root flag for diff-tree
        (
            run_git(&repo_path, &["diff-tree", "--root", "--no-commit-id", "-r", "-M", "-C", "--numstat", &hash])?,
            run_git(&repo_path, &["diff-tree", "--root", "--no-commit-id", "-r", "-M", "-C", "--name-status", &hash])?,
        )
    } else {
        (
            run_git(&repo_path, &["diff-tree", "--no-commit-id", "-r", "-M", "-C", "--numstat", &hash])?,
            run_git(&repo_path, &["diff-tree", "--no-commit-id", "-r", "-M", "-C", "--name-status", &hash])?,
        )
    };

    // Parse name-status lines into (status, display_file, old_file) tuples
    // Both --numstat and --name-status output files in the same order, so we join by index
    let status_entries: Vec<(String, String)> = name_status
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                let status_str = parts[0].to_string();
                let status_char = status_str.chars().next().unwrap_or('M');
                if (status_char == 'R' || status_char == 'C') && parts.len() >= 3 {
                    // Rename/copy: show "old → new"
                    let old = parts[1];
                    let new = parts[2];
                    (status_char.to_string(), format!("{} → {}", old, new))
                } else {
                    (status_char.to_string(), parts[1].to_string())
                }
            } else {
                ("M".to_string(), line.trim().to_string())
            }
        })
        .collect();

    let numstat_lines: Vec<&str> = numstat.lines().filter(|l| !l.is_empty()).collect();

    let files: Vec<Value> = numstat_lines
        .iter()
        .enumerate()
        .map(|(i, line)| {
            let parts: Vec<&str> = line.split('\t').collect();
            let (status, display_file) = status_entries
                .get(i)
                .cloned()
                .unwrap_or_else(|| ("M".to_string(), parts.get(2).unwrap_or(&"").to_string()));

            if parts.len() >= 3 {
                let added: i64 = parts[0].parse().unwrap_or(0);
                let removed: i64 = parts[1].parse().unwrap_or(0);
                let binary = parts[0] == "-";
                // For binary files, get the file size from the commit tree
                let size: Option<i64> = if binary {
                    // Use the actual file path (not the display path with →)
                    let lookup_file = if display_file.contains(" → ") {
                        display_file.split(" → ").last().unwrap_or(&display_file).trim().to_string()
                    } else {
                        display_file.clone()
                    };
                    run_git(&repo_path, &["cat-file", "-s", &format!("{}:{}", hash, lookup_file)])
                        .ok()
                        .and_then(|s| s.trim().parse().ok())
                } else {
                    None
                };
                let mut obj = serde_json::json!({
                    "file": display_file,
                    "added": if binary { 0 } else { added },
                    "removed": if binary { 0 } else { removed },
                    "binary": binary,
                    "status": status,
                });
                if let Some(s) = size {
                    obj["size"] = serde_json::json!(s);
                }
                obj
            } else {
                serde_json::json!({ "file": display_file, "added": 0, "removed": 0, "binary": false, "status": "M" })
            }
        })
        .collect();

    // Get author and date
    let info = run_git(&repo_path, &["log", "-1", "--format=%an|%aI", &hash])?;
    let info_parts: Vec<&str> = info.trim().splitn(2, '|').collect();
    let author = info_parts.first().unwrap_or(&"").to_string();
    let date = info_parts.get(1).unwrap_or(&"").to_string();

    Ok(serde_json::json!({
        "hash": hash,
        "message": message.trim(),
        "author": author,
        "date": date,
        "files": files,
    }))
}
