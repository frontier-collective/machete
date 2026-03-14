---
id: MACH-0010
title: Full git operations — bring feature parity with dedicated git GUIs
status: ready
priority: high
created: 2026-03-15
---

# MACH-0010: Full git operations — bring feature parity with dedicated git GUIs

## Motivation

Machete GUI covers the core workflow — commit, branch, merge/rebase, stash, cherry-pick, PR, release, prune — but daily git usage involves many more operations that currently require dropping to the terminal. Users of SourceTree, Fork, and GitKraken expect features like discarding changes, partial staging, amending commits, reverting, blame, and tag management as table stakes.

This story closes the gap so that Machete can be a user's **only** git interface. Every operation listed here is something a developer might need on any given day without having to open a terminal.

## Scope

### Tier 1: Essential (daily use)

Operations that users reach for constantly. Missing these forces them back to the terminal.

#### 1.1 Discard changes

Revert unstaged modifications per-file or for all files. SourceTree's most-used feature after commit.

**UI — staging panel:**
- Right-click unstaged file → "Discard Changes" (confirmation dialog)
- "Discard All" button in unstaged header (confirmation dialog)
- Confirmation shows file name(s) and warns that changes are permanently lost

**Rust backend:**
```
discard_file(repo_path, file_path)       → git checkout -- <file>  (tracked)
                                          → git clean -f <file>    (untracked)
discard_all(repo_path)                   → git checkout -- . && git clean -fd
```

**Safety:**
- Always confirm before discard — no undo
- Untracked files: confirm separately ("This will permanently delete N untracked files")
- Never discard staged files without explicit unstage-then-discard flow

#### 1.2 Partial staging (hunk/line staging)

Stage individual hunks or specific lines within a file, not just the whole file.

**UI — diff panel:**
- When viewing an unstaged file's diff, each hunk gets a `[+]` stage button in the gutter
- When viewing a staged file's diff, each hunk gets a `[-]` unstage button
- Line-level: select lines in the diff → right-click → "Stage Selected Lines" / "Unstage Selected Lines"
- Visual feedback: staged hunks/lines highlighted differently from unstaged

**Rust backend:**
```
stage_hunk(repo_path, file_path, hunk_header)     → git apply --cached (patch)
unstage_hunk(repo_path, file_path, hunk_header)    → git apply --cached --reverse (patch)
stage_lines(repo_path, file_path, line_ranges)     → git apply --cached (constructed patch)
unstage_lines(repo_path, file_path, line_ranges)   → git apply --cached --reverse (constructed patch)
```

The frontend constructs a patch from the selected hunk/lines and sends it to the backend, which applies it to the index via `git apply --cached`.

#### 1.3 Amend last commit

Edit the message and/or add files to the most recent commit.

**UI — commit bar:**
- "Amend" toggle/checkbox next to the Commit button
- When enabled:
  - Commit message textarea pre-fills with the last commit's message
  - Staged files will be added to the previous commit
  - Button text changes to "Amend Commit"
  - Warning badge if the commit has been pushed: "This commit has been pushed. Amending will require a force push."
- AI generate button still works (regenerates message based on amended diff)

**Rust backend:**
```
amend_commit(repo_path, message)    → git commit --amend -m <message>
get_last_commit_message(repo_path)  → git log -1 --format=%B
is_last_commit_pushed(repo_path)    → git log @{u}..HEAD --oneline (check if HEAD is in unpushed)
```

#### 1.4 Revert commit

Create a new commit that undoes a specific commit's changes. Safe — doesn't rewrite history.

**UI — commit log:**
- Right-click a commit → "Revert This Commit..."
- Confirmation dialog showing:
  - Commit hash and message being reverted
  - Warning if the commit is a merge commit (requires `-m` parent selection)
  - "This creates a new revert commit. It does not rewrite history."
- If conflicts occur, enter the conflict resolution flow (reuse existing merge/rebase conflict UI)

**Rust backend:**
```
revert_commit(repo_path, commit_hash)                → git revert <hash> --no-edit
revert_merge_commit(repo_path, commit_hash, parent)  → git revert <hash> -m <parent> --no-edit
```

#### 1.5 Reset to commit

Move the current branch pointer to a specific commit. Three modes with clear warnings.

**UI — commit log:**
- Right-click a commit → "Reset Current Branch to Here..."
- Dialog with mode selector:

```
┌─ Reset to abc1234 ───────────────────────────────────────┐
│                                                          │
│  Reset develop to:                                       │
│  abc1234 — "fix: handle edge case in parser"             │
│                                                          │
│  Mode:                                                   │
│    ○ Soft   — keep all changes staged                    │
│    ○ Mixed  — keep all changes unstaged (default)        │
│    ○ Hard   — discard all changes ⚠️                      │
│                                                          │
│  ⚠️ This will move 3 commits out of the branch.          │
│  Hard reset permanently discards those changes.          │
│                                                          │
│  ⚠️ These commits have been pushed to remote.            │
│  Resetting will require a force push.                    │
│                                                          │
│                          [ Cancel ]  [ Reset ]           │
└──────────────────────────────────────────────────────────┘
```

**Rust backend:**
```
reset_to_commit(repo_path, commit_hash, mode)  → git reset --soft/--mixed/--hard <hash>
count_commits_between(repo_path, from, to)     → git rev-list --count <from>..<to>
```

**Safety:**
- Hard reset requires explicit confirmation: "This will permanently discard N commits and all uncommitted changes."
- If commits are pushed, show force-push warning
- Default to mixed (safest useful option)

#### 1.6 Tag management

Create, delete, and push tags. Currently the sidebar shows tags read-only.

**UI — sidebar tags section:**
- "Create Tag" button (or right-click commit in log → "Tag This Commit...")
- Tag list shows local-only vs pushed indicators
- Right-click tag → "Delete Tag" (local), "Delete Tag from Remote", "Push Tag"
- Create tag dialog:

```
┌─ Create Tag ─────────────────────────────────────────────┐
│                                                          │
│  Name          [ v1.2.0              ]                   │
│  At commit     [ HEAD (abc1234)   ▾  ]                   │
│                                                          │
│  Type          ○ Lightweight                             │
│                ○ Annotated                               │
│                                                          │
│  Message       [ Release 1.2.0       ]                   │
│  (annotated only)                                        │
│                                                          │
│  ☑ Push tag to remote after creation                     │
│                                                          │
│                        [ Cancel ]  [ Create Tag ]        │
└──────────────────────────────────────────────────────────┘
```

**Rust backend:**
```
create_tag(repo_path, name, commit, annotated, message)  → git tag [-a -m <msg>] <name> <commit>
delete_tag(repo_path, name, delete_remote)               → git tag -d <name> [&& git push origin :refs/tags/<name>]
push_tag(repo_path, name)                                → git push origin <name>
push_all_tags(repo_path)                                 → git push origin --tags
```

#### 1.7 Remote management

Add, remove, rename, and configure remotes. Currently remotes are read-only in the sidebar.

**UI — sidebar remotes section or Settings:**
- Right-click remote → "Remove Remote", "Rename Remote", "Edit URL"
- "Add Remote" button
- Dialog for add/edit:

```
┌─ Add Remote ─────────────────────────────────────────────┐
│                                                          │
│  Name          [ upstream             ]                  │
│  URL           [ git@github.com:...   ]                  │
│                                                          │
│  ☑ Fetch after adding                                    │
│                                                          │
│                        [ Cancel ]  [ Add Remote ]        │
└──────────────────────────────────────────────────────────┘
```

**Rust backend:**
```
add_remote(repo_path, name, url)       → git remote add <name> <url>
remove_remote(repo_path, name)         → git remote remove <name>
rename_remote(repo_path, old, new)     → git remote rename <old> <new>
set_remote_url(repo_path, name, url)   → git remote set-url <name> <url>
```

### Tier 2: Important (weekly use)

Operations needed regularly but not every day.

#### 2.1 Interactive rebase

Reorder, squash, fixup, edit, and drop commits. The power-user tool for cleaning up history before merge.

**UI — commit log:**
- Select a range of commits (or right-click → "Interactive Rebase from Here...")
- Opens a dedicated interactive rebase panel:

```
┌─ Interactive Rebase ─────────────────────────────────────┐
│                                                          │
│  Rebasing 5 commits onto main                            │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ⠿ [pick   ▾] abc1234  feat: add user auth          │ │
│  │ ⠿ [squash ▾] def5678  wip: auth tweaks             │ │
│  │ ⠿ [pick   ▾] ghi9012  fix: token refresh           │ │
│  │ ⠿ [drop   ▾] jkl3456  debug: remove later          │ │
│  │ ⠿ [edit   ▾] mno7890  feat: add logout              │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ⠿ = drag to reorder                                    │
│  Actions: pick, squash, fixup, edit, drop, reword        │
│                                                          │
│  ⚠️ This rewrites history. Do not rebase commits that    │
│  have been pushed and shared with others.                │
│                                                          │
│                    [ Cancel ]  [ Start Rebase ]           │
└──────────────────────────────────────────────────────────┘
```

- Drag-and-drop to reorder commits
- Dropdown per commit: pick, reword, squash, fixup, edit, drop
- When "edit" is selected, the rebase pauses and the user can amend the commit, then click "Continue"
- Conflicts use the existing conflict resolution UI

**Rust backend:**
```
interactive_rebase(repo_path, onto, instructions)  → git rebase -i <onto> (via GIT_SEQUENCE_EDITOR)
```

The key challenge is non-interactive execution of interactive rebase. The backend generates a rebase-todo script and sets `GIT_SEQUENCE_EDITOR` to a script/command that writes the todo file, bypassing the editor. This is the standard approach used by other git GUIs.

#### 2.2 Blame / annotate

Line-by-line attribution showing who last changed each line and when.

**UI — file context menu or diff panel:**
- Right-click a file → "Blame" (or dedicated toolbar button when viewing a file)
- Opens a blame view:

```
┌─ Blame: src/lib/git.ts ─────────────────────────────────┐
│                                                          │
│  abc1234  Derek  2d ago  │  1  import { exec } from...   │
│  abc1234  Derek  2d ago  │  2  import { resolve }...     │
│  def5678  Alice  1w ago  │  3                            │
│  def5678  Alice  1w ago  │  4  export function parse..   │
│  ghi9012  Bob    3w ago  │  5    const result = [];      │
│  def5678  Alice  1w ago  │  6    for (const line of...   │
│  abc1234  Derek  2d ago  │  7      if (line.startsWith.. │
│                                                          │
│  Click a commit hash to see that commit's details        │
│  Click author to see all commits by that author          │
└──────────────────────────────────────────────────────────┘
```

- Commit hash column: click to jump to that commit in the log
- Color-coding: recent changes highlighted warmer, old changes cooler
- Hover a commit hash to see full commit message in tooltip
- "Blame previous revision" — re-blame at the parent of the selected commit (drill into history)

**Rust backend:**
```
blame_file(repo_path, file_path, commit)  → git blame --porcelain <file> [<commit>]
```

Parse porcelain output into structured data: commit hash, author, date, line content.

#### 2.3 File history

View the commit history for a specific file, including renames.

**UI — file context menu:**
- Right-click a file (in staging area, diff panel, or sidebar) → "View File History"
- Opens a commit list filtered to that file:

```
┌─ History: src/lib/git.ts ────────────────────────────────┐
│                                                          │
│  abc1234  feat: add branch parser      Derek   2d ago    │
│  def5678  fix: handle detached HEAD    Alice   1w ago    │
│  ghi9012  refactor: split git utils    Bob     3w ago    │
│  jkl3456  feat: initial git lib        Derek   2mo ago   │
│           (renamed from src/git.ts)                      │
│                                                          │
│  Click a commit to see the diff for that file at that    │
│  commit.                                                 │
└──────────────────────────────────────────────────────────┘
```

- Follows renames (`--follow`)
- Click a commit to see the diff of that file at that specific commit
- Integrates with blame: "Blame at this revision"

**Rust backend:**
```
file_history(repo_path, file_path)           → git log --follow --format=... -- <file>
file_diff_at_commit(repo_path, file, commit) → git show <commit> -- <file>
```

#### 2.4 Diff options

Configurable diff display settings.

**UI — diff panel toolbar:**
- Toggle: Unified vs Side-by-side diff
- Toggle: Show/hide whitespace changes
- Toggle: Word-level diff (inline word highlighting)
- Context lines slider: 3 (default) / 5 / 10 / all
- Persist preferences in localStorage

**Rust backend:**
- Pass flags to existing diff commands:
  - `--word-diff=porcelain` for word-level
  - `-w` or `--ignore-all-space` for whitespace
  - `-U<n>` for context lines
  - Side-by-side is a frontend rendering concern (same diff data, different layout)

#### 2.5 Submodule support

View submodule status and perform basic operations.

**UI — sidebar:**
- "Submodules" collapsible section (only shown if repo has submodules)
- Each submodule shows: name, current commit, dirty/clean status, branch
- Right-click submodule → "Update", "Init", "Open in New Tab", "Sync"

```
┌─ Submodules ───────────────────────────────────────────┐
│  ▾ Submodules                                          │
│    📦 shared-lib       abc1234  ✅  (main)              │
│    📦 vendor/protobuf  def5678  ⚠️ modified             │
│    📦 docs-theme       (not initialized)                │
└────────────────────────────────────────────────────────┘
```

**Rust backend:**
```
list_submodules(repo_path)                    → git submodule status
init_submodule(repo_path, submodule_path)     → git submodule init <path>
update_submodule(repo_path, submodule_path)   → git submodule update <path>
sync_submodules(repo_path)                    → git submodule sync
```

### Tier 3: Power-user (monthly use)

Advanced operations for experienced git users. Nice to have, not blockers.

#### 3.1 Worktree support

Manage multiple working trees for the same repository.

**UI — toolbar or sidebar:**
- "Worktrees" section in sidebar (only shown if worktrees exist beyond the main one)
- "Add Worktree" dialog: path, branch (new or existing), checkout
- Click a worktree → open it in a new tab
- Right-click → "Remove Worktree", "Reveal in Finder"

**Rust backend:**
```
list_worktrees(repo_path)                         → git worktree list --porcelain
add_worktree(repo_path, path, branch, new_branch) → git worktree add [-b <branch>] <path> [<commit>]
remove_worktree(repo_path, path)                  → git worktree remove <path>
```

#### 3.2 Reflog

View and recover from the reflog — the safety net for git operations.

**UI — accessible from commit log toolbar or menu:**
- "Show Reflog" button/toggle in commit log
- Replaces the normal commit log with the reflog view:

```
┌─ Reflog ─────────────────────────────────────────────────┐
│                                                          │
│  HEAD@{0}  abc1234  reset: moving to abc1234    2m ago   │
│  HEAD@{1}  def5678  commit: fix parser bug      5m ago   │
│  HEAD@{2}  ghi9012  checkout: moving to main    1h ago   │
│  HEAD@{3}  jkl3456  rebase (finish): onto main  1h ago   │
│  HEAD@{4}  mno7890  commit: wip                 2h ago   │
│                                                          │
│  Right-click → "Reset to this entry" to recover          │
└──────────────────────────────────────────────────────────┘
```

- Right-click an entry → "Reset Current Branch to Here" (opens the reset dialog from 1.5)
- Right-click → "Create Branch Here" (rescue a detached commit)
- Useful after accidental reset, rebase, or force push

**Rust backend:**
```
get_reflog(repo_path, limit)  → git reflog --format=... -n <limit>
```

#### 3.3 Bisect

Binary search for the commit that introduced a bug.

**UI — commit log toolbar:**
- "Start Bisect" button → enters bisect mode
- Bisect mode UI:

```
┌─ Bisect ─────────────────────────────────────────────────┐
│                                                          │
│  🔍 Bisecting: 7 revisions left to test                 │
│     (roughly 3 steps)                                    │
│                                                          │
│  Current: abc1234 — "feat: add user auth"                │
│                                                          │
│  Is this commit good or bad?                             │
│                                                          │
│  [ Good ✓ ]    [ Bad ✗ ]    [ Skip ⟳ ]    [ Abort ]     │
│                                                          │
│  History:                                                │
│    def5678  ✓ good                                       │
│    ghi9012  ✗ bad                                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- User marks the starting "bad" commit and a known "good" commit
- Git bisects, user marks each step as good/bad/skip
- On completion: shows the first bad commit with its diff

**Rust backend:**
```
bisect_start(repo_path, bad_commit, good_commit)  → git bisect start <bad> <good>
bisect_mark(repo_path, mark)                      → git bisect good/bad/skip
bisect_abort(repo_path)                            → git bisect reset
bisect_log(repo_path)                              → git bisect log
```

#### 3.4 3-way merge editor

Inline conflict resolution with base/ours/theirs side-by-side. Upgrades the existing "accept ours / accept theirs / open in editor" flow.

**UI — replaces the current conflict diff view:**

```
┌─ Resolve: src/lib/git.ts ────────────────────────────────┐
│                                                          │
│  Base (common ancestor)  │  Ours (current)  │  Theirs    │
│  ─────────────────────── │ ──────────────── │ ────────── │
│  const v = "0.3.0";      │ const v = "0.4.0";│ const v.. │
│                          │                   │            │
│  ── Result ──────────────────────────────────────────── │
│  const version = "0.4.0";                                │
│  [editable — user types the final result]                │
│                                                          │
│  [ Accept Ours ] [ Accept Theirs ] [ Accept Base ]       │
│                                                          │
│           [ Mark Resolved ]    [ Skip File ]             │
└──────────────────────────────────────────────────────────┘
```

- Three panes at top: base, ours, theirs (read-only)
- Result pane at bottom: editable, pre-filled with the conflicted file content
- Quick-accept buttons fill the result pane with the chosen version
- "Mark Resolved" stages the file with the result content

**Rust backend:**
```
get_conflict_versions(repo_path, file)  → git show :1:<file> (base), :2:<file> (ours), :3:<file> (theirs)
write_resolved(repo_path, file, content) → write content to file, then git add <file>
```

## Implementation order

The tiers are designed to be implemented roughly in order, but individual items within a tier are independent and can be shipped incrementally.

### Phase A: Daily essentials (Tier 1)

1. **Discard changes** — simplest to implement, highest daily impact
2. **Amend last commit** — small UI addition to commit bar, high value
3. **Tag management** — extends existing sidebar, moderate complexity
4. **Remote management** — extends existing sidebar/settings
5. **Revert commit** — extends commit log context menu
6. **Reset to commit** — extends commit log context menu, needs careful safety UX
7. **Partial staging** — most complex in Tier 1 (patch construction), but very high value

### Phase B: Weekly power tools (Tier 2)

8. **Diff options** — mostly frontend work, improves existing views
9. **File history** — extends file context menu, moderate backend work
10. **Blame / annotate** — new view, moderate complexity
11. **Submodule support** — new sidebar section, moderate backend work
12. **Interactive rebase** — most complex feature in the story (GIT_SEQUENCE_EDITOR trick)

### Phase C: Advanced (Tier 3)

13. **Reflog** — new view mode for commit log, simple backend
14. **Worktree support** — new sidebar section, integrates with tab system
15. **Bisect** — new modal workflow, moderate complexity
16. **3-way merge editor** — most complex UI component in the story

## Files to create

| File | Purpose |
|------|---------|
| `app/src/components/staging/HunkActions.tsx` | Hunk-level stage/unstage buttons in diff gutter |
| `app/src/components/staging/DiscardDialog.tsx` | Confirmation dialog for discarding changes |
| `app/src/components/commit/AmendToggle.tsx` | Amend checkbox/toggle for commit bar |
| `app/src/components/log/ResetDialog.tsx` | Reset mode selector with safety warnings |
| `app/src/components/log/RevertDialog.tsx` | Revert confirmation with merge-commit handling |
| `app/src/components/log/InteractiveRebasePanel.tsx` | Drag-and-drop rebase instruction editor |
| `app/src/components/log/BisectPanel.tsx` | Bisect workflow UI |
| `app/src/components/sidebar/TagDialog.tsx` | Create/delete tag dialog |
| `app/src/components/sidebar/RemoteDialog.tsx` | Add/edit/remove remote dialog |
| `app/src/components/sidebar/SubmoduleSection.tsx` | Submodule status and actions |
| `app/src/components/sidebar/WorktreeSection.tsx` | Worktree management |
| `app/src/components/blame/BlameView.tsx` | Line-by-line blame/annotate view |
| `app/src/components/log/FileHistoryPanel.tsx` | Per-file commit history |
| `app/src/components/log/ReflogView.tsx` | Reflog viewer |
| `app/src/components/merge/ThreeWayMergeEditor.tsx` | Base/ours/theirs merge resolution |
| `app/src/components/diff/DiffOptions.tsx` | Diff display settings toolbar |

## Files to modify

| File | Changes |
|------|---------|
| `app/src-tauri/src/commands.rs` | Add all new Tauri commands (discard, blame, reset, revert, tags, remotes, submodules, worktrees, bisect, interactive rebase, file history, hunk staging) |
| `app/src-tauri/src/lib.rs` | Register new commands in `invoke_handler` |
| `app/src/components/staging/StagingArea.tsx` | Add discard button, partial staging integration |
| `app/src/components/diff/DiffView.tsx` | Add hunk action buttons, diff options toolbar, side-by-side mode |
| `app/src/components/commit/CommitBar.tsx` | Add amend toggle |
| `app/src/components/log/CommitLog.tsx` | Add context menu items (revert, reset, interactive rebase, bisect, tag, file history) |
| `app/src/components/sidebar/Sidebar.tsx` | Add tag actions, remote actions, submodule section, worktree section |
| `app/src/components/merge/ConflictResolution.tsx` | Upgrade to 3-way merge editor option |

## Verification

### Per-feature testing

Each feature should be verified independently:

1. **Discard** — modify a file, discard, verify clean. Create untracked file, discard, verify deleted.
2. **Partial staging** — modify multiple hunks in a file, stage one hunk, verify partial stage in `git diff --cached`.
3. **Amend** — commit, toggle amend, stage new file, amend. Verify single commit with updated content.
4. **Revert** — revert a commit, verify new revert commit created. Test merge commit revert.
5. **Reset** — test all three modes (soft/mixed/hard). Verify pushed-commit warnings.
6. **Tags** — create lightweight and annotated tags, push, delete local, delete remote.
7. **Remotes** — add, rename, remove, edit URL. Verify fetch works with new remote.
8. **Interactive rebase** — reorder commits, squash two, drop one. Verify result.
9. **Blame** — blame a file, click through to commit, blame at previous revision.
10. **File history** — view history with renames, click through to commit diff.
11. **Diff options** — toggle side-by-side, word diff, whitespace, context lines.
12. **Submodules** — init, update, view status. Open submodule in new tab.
13. **Worktrees** — add, open in tab, remove.
14. **Reflog** — view reflog, reset to a previous entry, create branch from entry.
15. **Bisect** — start bisect, mark good/bad through several steps, verify identified commit.
16. **3-way merge** — create a conflict, use 3-way editor to resolve, verify clean merge.

### Integration testing

- `npx tsc --noEmit` in `app/` — TypeScript compiles with all new components
- `cargo check` in `app/src-tauri/` — Rust compiles with all new commands
- Full workflow: create branch → make changes → partial stage → amend → interactive rebase → merge with conflict → 3-way resolve → tag release
