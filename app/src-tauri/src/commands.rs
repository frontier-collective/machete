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

    if let Some(dir) = &exe_dir {
        // Walk up from target/{debug,release}/ to repo root
        // app/src-tauri/target/debug -> app/src-tauri/target -> app/src-tauri -> app -> repo root
        let repo_root = dir.join("../../../../");
        let cli_entry = repo_root.join("dist/index.js").canonicalize();
        if let Ok(entry) = cli_entry {
            eprintln!("[machete] Using dev CLI: node {}", entry.display());
            return (
                "node".to_string(),
                vec![entry.to_string_lossy().to_string()],
            );
        }
    }

    // Check common global install locations
    for candidate in &[
        "/opt/homebrew/bin/machete",
        "/usr/local/bin/machete",
    ] {
        if std::path::Path::new(candidate).exists() {
            eprintln!("[machete] Using global CLI: {}", candidate);
            return (candidate.to_string(), vec![]);
        }
    }

    // Last resort: hope it's on PATH
    let exe_path = exe_dir.map(|d| d.display().to_string()).unwrap_or_else(|| "unknown".to_string());
    eprintln!("[machete] WARNING: No dev CLI found (exe at: {}), falling back to bare 'machete' on PATH", exe_path);
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
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                format!("Machete CLI not found. Install it with: npm install -g @frontier-collective/machete")
            } else {
                format!("Failed to run machete ({}): {}", program, e)
            }
        })?;

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

/// Find the best git binary — prefer Homebrew/local installs over the Xcode shim.
fn git_binary() -> &'static str {
    static GIT: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    GIT.get_or_init(|| {
        // Prefer real git installs over the macOS /usr/bin/git Xcode shim
        for candidate in &[
            "/opt/homebrew/bin/git",
            "/usr/local/bin/git",
        ] {
            if std::path::Path::new(candidate).exists() {
                eprintln!("[machete] Using git: {}", candidate);
                return candidate.to_string();
            }
        }
        eprintln!("[machete] WARNING: No Homebrew/local git found, falling back to 'git' on PATH");
        "git".to_string()
    })
}

/// Run a raw git command in the given repo directory.
fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let git = git_binary();
    let output = Command::new(git)
        .args(args)
        .current_dir(repo_path)
        .env("PATH", enriched_path())
        // Prevent git from refreshing the stat cache in .git/index.
        // This avoids: (1) writing .git/index on read-only queries,
        // which would trigger the file watcher feedback loop, and
        // (2) index.lock contention between concurrent git commands.
        .env("GIT_OPTIONAL_LOCKS", "0")
        .output()
        .map_err(|e| format!("Failed to run git ({}): {}", git, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(strip_ansi(&format!("git failed: {}", stderr)));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Wrap a blocking closure in spawn_blocking so Command::output() doesn't
/// block the Tokio async runtime threads.
async fn off_main<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

// ─── Status ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_repo_status(repo_path: String) -> Result<Value, String> {
    off_main(move || {
        // Native Rust implementation — avoids spawning Node + multiple git subprocesses.
        // ~20-30ms vs ~400ms when going through the CLI.

        // 1. Branch name (returns "HEAD" when detached)
        let branch = run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])
            .unwrap_or_else(|_| "HEAD".to_string());

        // If detached, grab the short hash so the UI can show "HEAD (abc1234)"
        let detached_at: Option<String> = if branch == "HEAD" {
            run_git(&repo_path, &["rev-parse", "--short", "HEAD"]).ok()
        } else {
            None
        };

        // 2. Porcelain status → staged/unstaged file lists
        //    -M10% enables rename detection with a low similarity threshold
        let porcelain = run_git(&repo_path, &["status", "--porcelain=v1", "-uall", "-M10%"])?;
        let mut staged_files: Vec<String> = Vec::new();
        let mut unstaged_files: Vec<String> = Vec::new();

        for line in porcelain.lines() {
            if line.len() < 3 {
                continue;
            }
            let index_status = line.as_bytes()[0];
            let worktree_status = line.as_bytes()[1];
            let file = line[3..].to_string();

            // Index (staged) changes: anything other than ' ' or '?'
            if index_status != b' ' && index_status != b'?' {
                staged_files.push(file.clone());
            }
            // Worktree (unstaged) changes: anything other than ' ' or '?'
            // '?' means untracked — count as unstaged
            if worktree_status != b' ' || index_status == b'?' {
                unstaged_files.push(file);
            }
        }

        let is_clean = staged_files.is_empty() && unstaged_files.is_empty();
        let staged_count = staged_files.len();
        let unstaged_count = unstaged_files.len();

        // 3. Remote for the current branch (falls back to "origin")
        let remote = run_git(
            &repo_path,
            &["config", &format!("branch.{}.remote", branch)],
        )
        .unwrap_or_else(|_| "origin".to_string());

        // 4. Ahead/behind counts using rev-list --left-right --count
        let (ahead, behind) = match run_git(
            &repo_path,
            &[
                "rev-list",
                "--left-right",
                "--count",
                &format!("{}/{}...{}", remote, branch, branch),
            ],
        ) {
            Ok(output) => {
                let parts: Vec<&str> = output.split_whitespace().collect();
                let behind_count: u64 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
                let ahead_count: u64 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
                (ahead_count, behind_count)
            }
            Err(_) => (0, 0), // No upstream tracking branch
        };

        Ok(serde_json::json!({
            "branch": branch,
            "isClean": is_clean,
            "stagedFiles": staged_files,
            "unstagedFiles": unstaged_files,
            "stagedCount": staged_count,
            "unstagedCount": unstaged_count,
            "remote": remote,
            "aheadCount": ahead,
            "behindCount": behind,
            "detachedAt": detached_at,
        }))
    }).await
}

// ─── Commit ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_commit_context(repo_path: String) -> Result<Value, String> {
    off_main(move || {
        // Branch name
        let branch = run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])
            .unwrap_or_else(|_| "HEAD".to_string());

        // Recent commits
        let recent = run_git(&repo_path, &["log", "--oneline", "-5"])
            .unwrap_or_default();
        let recent_commits: Vec<&str> = recent.lines().collect();

        // Staged files with diff stats
        // -M10%: rename detection with low similarity threshold
        // -C -C: copy detection that checks ALL files (not just modified) as copy sources
        let staged_numstat = run_git(&repo_path, &["diff", "--cached", "-M10%", "-C", "-C", "--numstat"])
            .unwrap_or_default();
        let staged_namestatus = run_git(&repo_path, &["diff", "--cached", "-M10%", "-C", "-C", "--name-status"])
            .unwrap_or_default();
        let staged: Vec<Value> = parse_numstat_with_status(&staged_numstat, &staged_namestatus);

        // Unstaged tracked files with diff stats
        let unstaged_numstat = run_git(&repo_path, &["diff", "-M10%", "-C", "-C", "--numstat"])
            .unwrap_or_default();
        let unstaged_namestatus = run_git(&repo_path, &["diff", "-M10%", "-C", "-C", "--name-status"])
            .unwrap_or_default();
        let mut unstaged: Vec<Value> = parse_numstat_with_status(&unstaged_numstat, &unstaged_namestatus);

        // Untracked files (not in index, not ignored)
        let untracked_output = run_git(&repo_path, &["ls-files", "--others", "--exclude-standard"])
            .unwrap_or_default();
        let unstaged_names: std::collections::HashSet<String> = unstaged.iter()
            .filter_map(|v| v.get("file").and_then(|f| f.as_str()).map(|s| s.to_string()))
            .collect();
        for line in untracked_output.lines() {
            let file = line.trim();
            if !file.is_empty() && !unstaged_names.contains(file) {
                unstaged.push(serde_json::json!({
                    "file": file,
                    "added": 0,
                    "removed": 0,
                    "binary": false,
                    "status": "?"
                }));
            }
        }

        Ok(serde_json::json!({
            "branch": branch,
            "staged": staged,
            "unstaged": unstaged,
            "recentCommits": recent_commits,
        }))
    }).await
}

/// Parse --numstat and --name-status output together to get full file info with status codes.
/// --numstat gives: added\tremoved\tfile (for renames: added\tremoved\told\tnew)
/// --name-status gives: STATUS\tfile (for renames: R###\told\tnew)
fn parse_numstat_with_status(numstat_output: &str, namestatus_output: &str) -> Vec<Value> {
    // Build a map from filename → status code from --name-status
    let mut status_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for line in namestatus_output.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.is_empty() { continue; }
        let status_code = parts[0].chars().next().unwrap_or('M').to_string();
        if (status_code == "R" || status_code == "C") && parts.len() >= 3 {
            // Rename/copy: key is "old → new"
            let key = format!("{} → {}", parts[1], parts[2]);
            status_map.insert(key, status_code);
        } else if parts.len() >= 2 {
            status_map.insert(parts[1].to_string(), status_code);
        }
    }

    numstat_output.lines().filter_map(|line| {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 3 { return None; }
        let binary = parts[0] == "-";
        let added: u64 = parts[0].parse().unwrap_or(0);
        let removed: u64 = parts[1].parse().unwrap_or(0);

        // With -M, renames have 4 tab-separated fields: added\tremoved\told\tnew
        let (file, status) = if parts.len() >= 4 {
            // Rename detected by numstat
            let display = format!("{} → {}", parts[2], parts[3]);
            let s = status_map.get(&display).cloned().unwrap_or_else(|| "R".to_string());
            (display, s)
        } else {
            let f = parts[2].to_string();
            // Also handle the {old => new} format that git sometimes uses
            if f.contains(" => ") {
                // Normalize {prefix/}{old => new} to "old_path → new_path"
                let normalized = normalize_git_rename(&f);
                let s = status_map.get(&normalized).cloned()
                    .or_else(|| status_map.get(&f).cloned())
                    .unwrap_or_else(|| "R".to_string());
                (normalized, s)
            } else {
                let s = status_map.get(&f).cloned().unwrap_or_else(|| "M".to_string());
                (f, s)
            }
        };

        Some(serde_json::json!({
            "file": file,
            "added": added,
            "removed": removed,
            "binary": binary,
            "status": status,
        }))
    }).collect()
}

#[tauri::command]
pub async fn generate_commit_message(repo_path: String) -> Result<Value, String> {
    off_main(move || run_machete(&repo_path, &["commit", "--generate"])).await
}

#[tauri::command]
pub async fn create_commit(repo_path: String, message: String) -> Result<String, String> {
    off_main(move || {
        run_git(&repo_path, &["commit", "-m", &message])?;
        Ok("Committed successfully".to_string())
    }).await
}

/// Expand "old → new" rename format into individual file paths
fn expand_rename_paths(files: &[String]) -> Vec<String> {
    let mut expanded = Vec::new();
    for f in files {
        if f.contains(" → ") {
            let parts: Vec<&str> = f.split(" → ").collect();
            expanded.push(parts[0].trim().to_string());
            expanded.push(parts[1].trim().to_string());
        } else {
            expanded.push(f.clone());
        }
    }
    expanded
}

/// Normalize git's compact rename notation: "{prefix/}{old => new}{/suffix}"
/// into "old_full_path → new_full_path" using the " → " separator.
fn normalize_git_rename(s: &str) -> String {
    // Format: {prefix}{old => new}{suffix}  e.g. "src/{old.ts => new.ts}" or "{a => b}"
    if let (Some(open), Some(arrow), Some(close)) = (
        s.find('{'),
        s.find(" => "),
        s.find('}'),
    ) {
        let prefix = &s[..open];
        let old_part = &s[open + 1..arrow];
        let new_part = &s[arrow + 4..close];
        let suffix = &s[close + 1..];
        format!("{}{}{} → {}{}{}", prefix, old_part, suffix, prefix, new_part, suffix)
    } else if s.contains(" => ") {
        // Simple "old => new" without braces
        let parts: Vec<&str> = s.splitn(2, " => ").collect();
        format!("{} → {}", parts[0], parts[1])
    } else {
        s.to_string()
    }
}

/// Build a synthetic unified diff showing file contents as all additions (new file).
fn synthetic_new_file_diff(file: &str, contents: &str) -> String {
    let line_count = contents.lines().count();
    let mut diff = format!(
        "diff --git a/{f} b/{f}\nnew file mode 100644\n--- /dev/null\n+++ b/{f}\n@@ -0,0 +1,{lc} @@\n",
        f = file, lc = line_count
    );
    for line in contents.lines() {
        diff.push('+');
        diff.push_str(line);
        diff.push('\n');
    }
    diff
}

/// Extract a single file's diff section from a full `git diff` output.
/// Each section starts with "diff --git a/... b/..." — we find the one
/// matching our old/new file pair and return everything up to the next section.
fn extract_diff_section(full_diff: &str, old_file: &str, new_file: &str) -> Option<String> {
    // Look for "diff --git a/<old> b/<new>" or "diff --git a/<new> b/<new>" (for renames)
    let marker_rename = format!("diff --git a/{} b/{}", old_file, new_file);
    let marker_new = format!("diff --git a/{} b/{}", new_file, new_file);

    eprintln!("[machete] extract_diff_section: looking for '{}' or '{}'", marker_rename, marker_new);
    eprintln!("[machete] extract_diff_section: full diff length={}, first 200 chars: {:?}",
        full_diff.len(), &full_diff[..full_diff.len().min(200)]);

    let start = full_diff.find(&marker_rename)
        .or_else(|| full_diff.find(&marker_new))?;

    // Find the end: next "diff --git" line after our section
    let rest = &full_diff[start..];
    let end = rest[1..].find("\ndiff --git ")
        .map(|pos| start + 1 + pos + 1) // +1 for the newline
        .unwrap_or(full_diff.len());

    let section = full_diff[start..end].trim_end().to_string();
    eprintln!("[machete] extract_diff_section: found section, length={}", section.len());
    if section.is_empty() { None } else { Some(section) }
}

#[tauri::command]
pub async fn stage_files(repo_path: String, files: Vec<String>) -> Result<String, String> {
    off_main(move || {
        let expanded = expand_rename_paths(&files);
        let file_refs: Vec<&str> = expanded.iter().map(|s| s.as_str()).collect();
        let mut args = vec!["add"];
        args.extend(file_refs);
        run_git(&repo_path, &args)?;
        Ok("Staged".to_string())
    }).await
}

#[tauri::command]
pub async fn unstage_files(repo_path: String, files: Vec<String>) -> Result<String, String> {
    off_main(move || {
        let expanded = expand_rename_paths(&files);
        let file_refs: Vec<&str> = expanded.iter().map(|s| s.as_str()).collect();
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
    }).await
}

#[tauri::command]
pub async fn get_file_diff(
    repo_path: String,
    file: String,
    staged: bool,
    commit_hash: Option<String>,
    context_lines: Option<u32>,
) -> Result<String, String> {
    off_main(move || {
        let ctx = format!("-U{}", context_lines.unwrap_or(3));
        eprintln!("[machete] get_file_diff: file='{}', staged={}, commit_hash={:?}", file, staged, commit_hash);

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
                // Run unfiltered diff and extract section for this rename
                let full_diff = run_git(&repo_path, &["diff", "-M10%", &ctx, &parent, &hash]);
                if let Ok(ref full) = full_diff {
                    if let Some(section) = extract_diff_section(full, old_file, new_file) {
                        if section.contains("copy from") && !section.contains("\n@@") {
                            if let Ok(contents) = run_git(&repo_path, &["show", &format!("{}:{}", hash, new_file)]) {
                                if !contents.trim().is_empty() {
                                    return Ok(synthetic_new_file_diff(new_file, &contents));
                                }
                            }
                        }
                        return Ok(section);
                    }
                }
                // Fallback
                run_git(&repo_path, &["diff", &ctx, &parent, &hash, "--", new_file])
            } else {
                run_git(&repo_path, &["diff", "-M", &ctx, &parent, &hash, "--", &file])
            }
        } else if staged {
            // Handle renamed files: "old → new" format
            // Path filters prevent git from detecting renames, so we run an
            // unfiltered diff and extract the section for this file pair.
            if file.contains(" → ") {
                let parts: Vec<&str> = file.split(" → ").collect();
                let old_file = parts[0].trim();
                let new_file = parts[1].trim();
                eprintln!("[machete] get_file_diff: staged rename detected, old='{}', new='{}'", old_file, new_file);

                // Run full unfiltered diff with rename+copy detection
                let full_diff = run_git(&repo_path, &["diff", "--cached", "-M10%", "-C", "-C", &ctx]);
                if let Ok(ref full) = full_diff {
                    if let Some(section) = extract_diff_section(full, old_file, new_file) {
                        // If section is a copy with no hunks, treat as new file
                        if section.contains("copy from") && !section.contains("\n@@") {
                            if let Ok(contents) = run_git(&repo_path, &["show", &format!(":{}", new_file)]) {
                                if !contents.trim().is_empty() {
                                    return Ok(synthetic_new_file_diff(new_file, &contents));
                                }
                            }
                        }
                        return Ok(section);
                    }
                }

                // Fallback: just diff the new file without rename detection
                return run_git(&repo_path, &["diff", "--cached", &ctx, "--", new_file]);
            }
            let result = run_git(&repo_path, &["diff", "--cached", "-M10%", "-C", "-C", &ctx, "--", &file])?;
            if result.trim().is_empty() {
                // Might be a newly staged untracked file — try diff against empty tree
                let empty_tree = "4b825dc642cb6eb9a060e54bf899d15f3f9382e1";
                let alt = run_git(&repo_path, &["diff", "--cached", "-M", &ctx, empty_tree, "--", &file]);
                if let Ok(ref alt_result) = alt {
                    if !alt_result.trim().is_empty() {
                        return alt;
                    }
                }
            }
            Ok(result)
        } else {
            // Handle renamed files: "old → new" format
            if file.contains(" → ") {
                let parts: Vec<&str> = file.split(" → ").collect();
                let old_file = parts[0].trim();
                let new_file = parts[1].trim();
                eprintln!("[machete] get_file_diff: unstaged rename detected, old='{}', new='{}'", old_file, new_file);

                // Run full unfiltered diff with rename+copy detection
                let full_diff = run_git(&repo_path, &["diff", "-M10%", "-C", "-C", &ctx]);
                if let Ok(ref full) = full_diff {
                    if let Some(section) = extract_diff_section(full, old_file, new_file) {
                        if section.contains("copy from") && !section.contains("\n@@") {
                            let file_path = std::path::Path::new(&repo_path).join(new_file);
                            if let Ok(contents) = std::fs::read_to_string(&file_path) {
                                if !contents.trim().is_empty() {
                                    return Ok(synthetic_new_file_diff(new_file, &contents));
                                }
                            }
                        }
                        return Ok(section);
                    }
                }

                // Fallback: just diff the new file without rename detection
                return run_git(&repo_path, &["diff", &ctx, "--", new_file]);
            }
            let result = run_git(&repo_path, &["diff", "-M10%", "-C", "-C", &ctx, "--", &file])?;
            if result.trim().is_empty() {
                // Check if this is an untracked file — read its contents directly
                let file_path = std::path::Path::new(&repo_path).join(&file);
                if file_path.exists() && file_path.is_file() {
                    // Check if the file is tracked
                    let is_tracked = run_git(&repo_path, &["ls-files", "--error-unmatch", &file]).is_ok();
                    if !is_tracked {
                        // Return raw file contents as a synthetic unified diff
                        match std::fs::read_to_string(&file_path) {
                            Ok(contents) => {
                                let line_count = contents.lines().count();
                                let mut synthetic = format!(
                                    "diff --git a/{f} b/{f}\nnew file mode 100644\n--- /dev/null\n+++ b/{f}\n@@ -0,0 +1,{lc} @@\n",
                                    f = file, lc = line_count
                                );
                                for line in contents.lines() {
                                    synthetic.push('+');
                                    synthetic.push_str(line);
                                    synthetic.push('\n');
                                }
                                return Ok(synthetic);
                            }
                            Err(_) => {
                                // Binary or unreadable — just return empty
                                return Ok(result);
                            }
                        }
                    }
                }
            }
            Ok(result)
        }
    }).await
}

#[tauri::command]
pub async fn push_current_branch(repo_path: String) -> Result<String, String> {
    off_main(move || {
        let branch = run_git(&repo_path, &["branch", "--show-current"])?;
        run_git(&repo_path, &["push", "-u", "origin", &branch])?;
        Ok(format!("Pushed {}", branch))
    }).await
}

#[tauri::command]
pub async fn pull_current_branch(repo_path: String) -> Result<String, String> {
    off_main(move || {
        let branch = run_git(&repo_path, &["branch", "--show-current"])?;
        run_git(&repo_path, &["pull", "origin", &branch])?;
        Ok(format!("Pulled {}", branch))
    }).await
}

#[tauri::command]
pub async fn fetch_remote(repo_path: String) -> Result<String, String> {
    off_main(move || {
        run_git(&repo_path, &["fetch", "--prune"])?;
        Ok("Fetched".to_string())
    }).await
}

#[tauri::command]
pub async fn create_branch(
    repo_path: String,
    name: String,
    source: String,
    checkout: bool,
) -> Result<String, String> {
    off_main(move || {
        if checkout {
            run_git(&repo_path, &["checkout", "-b", &name, &source])?;
            Ok(format!("Created and switched to {}", name))
        } else {
            run_git(&repo_path, &["branch", &name, &source])?;
            Ok(format!("Created branch {}", name))
        }
    }).await
}

// ─── Prune ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_branch_classification(repo_path: String) -> Result<Value, String> {
    off_main(move || run_machete(&repo_path, &["prune", "--dry-run"])).await
}

#[tauri::command]
pub async fn delete_branches(repo_path: String, branches: Vec<String>) -> Result<Vec<String>, String> {
    off_main(move || {
        let mut deleted = Vec::new();
        for branch in &branches {
            match run_git(&repo_path, &["branch", "-d", branch]) {
                Ok(_) => deleted.push(branch.clone()),
                Err(e) => return Err(format!("Failed to delete {}: {}", branch, e)),
            }
        }
        Ok(deleted)
    }).await
}

// ─── PR ─────────────────────────────────────────────────────────────

/// Detect the default base branch: prBaseBranch config → remote default → "main"
#[tauri::command]
pub async fn get_default_base_branch(repo_path: String) -> Result<String, String> {
    off_main(move || {
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
    }).await
}

#[tauri::command]
pub async fn get_pr_context(repo_path: String, base: String) -> Result<Value, String> {
    off_main(move || run_machete(&repo_path, &["pr", "--base", &base])).await
}

#[tauri::command]
pub async fn generate_pr(repo_path: String, base: String) -> Result<Value, String> {
    off_main(move || run_machete(&repo_path, &["pr", "--base", &base, "--generate"])).await
}

#[tauri::command]
pub async fn create_pr(
    repo_path: String,
    title: String,
    body: String,
    base: String,
    draft: bool,
) -> Result<String, String> {
    off_main(move || {
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
    }).await
}

// ─── List pull requests (via gh CLI) ────────────────────────────────

#[tauri::command]
pub async fn list_prs(repo_path: String) -> Result<Value, String> {
    off_main(move || {
        let output = Command::new("gh")
            .args(&[
                "pr", "list",
                "--state", "open",
                "--json", "number,title,state,isDraft,headRefName,baseRefName,author,url,createdAt,updatedAt,additions,deletions,changedFiles,reviewDecision,labels,comments",
                "--limit", "50",
            ])
            .current_dir(&repo_path)
            .env("PATH", enriched_path())
            .output()
            .map_err(|e| format!("Failed to run gh: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(strip_ansi(&format!("gh pr list failed: {}", stderr)));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse JSON: {}", e))
    }).await
}

// ─── Release ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_release_preview(repo_path: String) -> Result<Value, String> {
    off_main(move || run_machete(&repo_path, &["release"])).await
}

// ─── Config ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_config_list(repo_path: String) -> Result<Value, String> {
    off_main(move || run_machete(&repo_path, &["config", "--list"])).await
}

#[tauri::command]
pub async fn set_config_value(
    repo_path: String,
    key: String,
    value: String,
    global: bool,
) -> Result<String, String> {
    off_main(move || {
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
    }).await
}

// ─── Sidebar data (branches, remotes, tags) ─────────────────────────

#[tauri::command]
pub async fn get_branches(repo_path: String) -> Result<Value, String> {
    off_main(move || {
        // Local branches with current marker, upstream tracking, and ahead/behind info
        let current = run_git(&repo_path, &["branch", "--show-current"])?;
        let output = run_git(
            &repo_path,
            &[
                "for-each-ref",
                "--format=%(refname:short)|%(upstream:short)|%(upstream:track)",
                "refs/heads/",
            ],
        )?;
        let branches: Vec<Value> = output
            .lines()
            .filter(|l| !l.is_empty())
            .map(|line| {
                let parts: Vec<&str> = line.splitn(3, '|').collect();
                let name = parts[0].trim();
                let upstream = parts.get(1).unwrap_or(&"").trim();
                let track = parts.get(2).unwrap_or(&"").trim();

                let has_remote = !upstream.is_empty();

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
                    "hasRemote": has_remote,
                })
            })
            .collect();
        Ok(serde_json::json!(branches))
    }).await
}

#[tauri::command]
pub async fn get_remotes(repo_path: String) -> Result<Value, String> {
    off_main(move || {
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
                .filter(|l| {
                    let l = l.trim();
                    // Filter out empty lines, HEAD symref (shows as bare remote
                    // name when using refname:short), and any explicit HEAD refs
                    !l.is_empty() && l != remote && !l.contains("HEAD")
                })
                .map(|l| l.trim().to_string())
                .collect();

            remotes.push(serde_json::json!({
                "name": remote,
                "branches": branches,
            }));
        }

        Ok(serde_json::json!(remotes))
    }).await
}

#[tauri::command]
pub async fn get_tags(repo_path: String) -> Result<Value, String> {
    off_main(move || {
        let output = run_git(&repo_path, &["tag", "--sort=-creatordate"]).unwrap_or_default();
        let tags: Vec<String> = output
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| l.trim().to_string())
            .collect();
        Ok(serde_json::json!(tags))
    }).await
}

// ─── Commit log ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_commit_log(repo_path: String, count: Option<u32>) -> Result<Value, String> {
    off_main(move || {
        // %H=hash %h=short %P=parents %s=subject %an=author %aI=date %D=refs
        let format = "--format=%H%n%h%n%P%n%s%n%an%n%aI%n%D%n---";
        let output = match count {
            Some(n) => run_git(&repo_path, &["log", &format!("-{}", n), format, "--all"])?,
            None => run_git(&repo_path, &["log", format, "--all"])?,
        };

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
    }).await
}

// ─── Branch checkout ─────────────────────────────────────────────────

#[tauri::command]
pub async fn checkout_branch(repo_path: String, branch: String) -> Result<String, String> {
    off_main(move || {
        run_git(&repo_path, &["checkout", &branch])?;
        Ok(format!("Switched to {}", branch))
    }).await
}

// ─── Branch naming helpers ──────────────────────────────────────────

#[tauri::command]
pub async fn get_next_story_id(repo_path: String) -> Result<String, String> {
    off_main(move || {
        let mut max_id: u32 = 0;

        // Scan local branch names for MACH-NNNN patterns
        let branches = run_git(&repo_path, &["branch", "--format=%(refname:short)"])?;
        for line in branches.lines() {
            for cap in extract_mach_ids(line) {
                if cap > max_id { max_id = cap; }
            }
        }

        // Scan docs/backlog/stories/ filenames for MACH-NNNN patterns
        let stories_dir = std::path::Path::new(&repo_path).join("docs/backlog/stories");
        if stories_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&stories_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    for cap in extract_mach_ids(&name) {
                        if cap > max_id { max_id = cap; }
                    }
                }
            }
        }
        // Also check implemented/
        let impl_dir = stories_dir.join("implemented");
        if impl_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&impl_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    for cap in extract_mach_ids(&name) {
                        if cap > max_id { max_id = cap; }
                    }
                }
            }
        }

        Ok(format!("MACH-{:04}", max_id + 1))
    }).await
}

/// Extract all MACH-NNNN numeric IDs from a string.
fn extract_mach_ids(s: &str) -> Vec<u32> {
    let mut ids = Vec::new();
    let mut rest = s;
    while let Some(pos) = rest.find("MACH-") {
        let after = &rest[pos + 5..];
        let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(n) = digits.parse::<u32>() {
            ids.push(n);
        }
        rest = &rest[pos + 5..];
    }
    ids
}

// ─── Merge / Rebase ─────────────────────────────────────────────────

#[tauri::command]
pub async fn merge_preview(repo_path: String, branch: String) -> Result<Value, String> {
    off_main(move || {
        let current = run_git(&repo_path, &["branch", "--show-current"])?;

        // Count commits that would be merged
        let count_output = run_git(
            &repo_path,
            &["rev-list", "--count", &format!("{}..{}", current, branch)],
        )?;
        let commit_count: u64 = count_output.trim().parse().unwrap_or(0);

        // Check if fast-forward is possible
        let merge_base = run_git(&repo_path, &["merge-base", &current, &branch])?;
        let current_hash = run_git(&repo_path, &["rev-parse", &current])?;
        let can_ff = merge_base.trim() == current_hash.trim();

        Ok(serde_json::json!({
            "currentBranch": current,
            "sourceBranch": branch,
            "commitCount": commit_count,
            "canFastForward": can_ff,
        }))
    }).await
}

#[tauri::command]
pub async fn merge_branch(
    repo_path: String,
    branch: String,
    strategy: String,
) -> Result<Value, String> {
    off_main(move || {
        let result = match strategy.as_str() {
            "ff-only" => run_git(&repo_path, &["merge", "--ff-only", &branch]),
            "squash" => {
                run_git(&repo_path, &["merge", "--squash", &branch])?;
                // Squash merge stages changes but doesn't commit
                return Ok(serde_json::json!({
                    "success": true,
                    "squash": true,
                    "message": format!("Squash-merged {} — staged changes ready to commit", branch),
                }));
            }
            _ => run_git(&repo_path, &["merge", "--no-ff", &branch]),
        };

        match result {
            Ok(output) => Ok(serde_json::json!({
                "success": true,
                "squash": false,
                "message": output,
            })),
            Err(e) => {
                // Check if the failure is due to conflicts
                let conflicts = get_conflict_list(&repo_path);
                if !conflicts.is_empty() {
                    Ok(serde_json::json!({
                        "success": false,
                        "conflicts": conflicts,
                        "message": "Merge conflicts detected",
                        "operation": "merge",
                    }))
                } else {
                    Err(e)
                }
            }
        }
    }).await
}

#[tauri::command]
pub async fn rebase_branch(repo_path: String, onto: String) -> Result<Value, String> {
    off_main(move || {
        match run_git(&repo_path, &["rebase", &onto]) {
            Ok(output) => Ok(serde_json::json!({
                "success": true,
                "message": output,
            })),
            Err(e) => {
                let conflicts = get_conflict_list(&repo_path);
                if !conflicts.is_empty() {
                    Ok(serde_json::json!({
                        "success": false,
                        "conflicts": conflicts,
                        "message": "Rebase conflicts detected",
                        "operation": "rebase",
                    }))
                } else {
                    Err(e)
                }
            }
        }
    }).await
}

#[tauri::command]
pub async fn get_conflict_files(repo_path: String) -> Result<Value, String> {
    off_main(move || {
        let conflicts = get_conflict_list(&repo_path);
        Ok(serde_json::json!(conflicts))
    }).await
}

/// Internal helper: get list of conflicted files with their status.
fn get_conflict_list(repo_path: &str) -> Vec<Value> {
    let porcelain = run_git(repo_path, &["status", "--porcelain=v1"]).unwrap_or_default();
    porcelain
        .lines()
        .filter(|line| {
            if line.len() < 3 { return false; }
            let x = line.as_bytes()[0];
            let y = line.as_bytes()[1];
            // UU = both modified, AA = both added, DD = both deleted,
            // DU/UD = deleted by one side, AU/UA = added by one side
            matches!((x, y),
                (b'U', b'U') | (b'A', b'A') | (b'D', b'D') |
                (b'U', b'A') | (b'A', b'U') | (b'U', b'D') | (b'D', b'U')
            )
        })
        .map(|line| {
            let status = &line[0..2];
            let file = line[3..].to_string();
            serde_json::json!({
                "file": file,
                "status": status.trim(),
            })
        })
        .collect()
}

#[tauri::command]
pub async fn resolve_conflict(
    repo_path: String,
    file: String,
    resolution: String,
) -> Result<String, String> {
    off_main(move || {
        match resolution.as_str() {
            "ours" => {
                run_git(&repo_path, &["checkout", "--ours", "--", &file])?;
                run_git(&repo_path, &["add", &file])?;
            }
            "theirs" => {
                run_git(&repo_path, &["checkout", "--theirs", "--", &file])?;
                run_git(&repo_path, &["add", &file])?;
            }
            "manual" => {
                // User resolved manually — just stage it
                run_git(&repo_path, &["add", &file])?;
            }
            _ => return Err(format!("Unknown resolution: {}", resolution)),
        }
        Ok(format!("Resolved {}", file))
    }).await
}

#[tauri::command]
pub async fn abort_merge_or_rebase(repo_path: String) -> Result<String, String> {
    off_main(move || {
        // Try merge abort first, then rebase abort
        if run_git(&repo_path, &["merge", "--abort"]).is_ok() {
            return Ok("Merge aborted".to_string());
        }
        if run_git(&repo_path, &["rebase", "--abort"]).is_ok() {
            return Ok("Rebase aborted".to_string());
        }
        Err("No merge or rebase in progress".to_string())
    }).await
}

#[tauri::command]
pub async fn continue_merge_or_rebase(repo_path: String) -> Result<String, String> {
    off_main(move || {
        // Check if we're in a rebase
        let git_dir = run_git(&repo_path, &["rev-parse", "--git-dir"])?;
        let rebase_dir = std::path::Path::new(&repo_path).join(git_dir.trim()).join("rebase-merge");
        let rebase_apply = std::path::Path::new(&repo_path).join(git_dir.trim()).join("rebase-apply");

        if rebase_dir.exists() || rebase_apply.exists() {
            run_git(&repo_path, &["rebase", "--continue"])?;
            return Ok("Rebase continued".to_string());
        }

        // Otherwise try merge continue (just commit since conflicts are resolved)
        run_git(&repo_path, &["commit", "--no-edit"])?;
        Ok("Merge completed".to_string())
    }).await
}

#[tauri::command]
pub async fn check_merge_state(repo_path: String) -> Result<Value, String> {
    off_main(move || {
        let git_dir_str = run_git(&repo_path, &["rev-parse", "--git-dir"])?;
        let git_dir = std::path::Path::new(&repo_path).join(git_dir_str.trim());

        let in_merge = git_dir.join("MERGE_HEAD").exists();
        let in_rebase = git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists();

        let conflicts = if in_merge || in_rebase {
            get_conflict_list(&repo_path)
        } else {
            vec![]
        };

        Ok(serde_json::json!({
            "inMerge": in_merge,
            "inRebase": in_rebase,
            "conflicts": conflicts,
        }))
    }).await
}

// ─── Commit detail (for viewing a historical commit) ────────────────

#[tauri::command]
pub async fn get_commit_detail(repo_path: String, hash: String) -> Result<Value, String> {
    off_main(move || {
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
    }).await
}
