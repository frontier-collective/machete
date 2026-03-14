---
id: MACH-0007
title: Machete GUI — cross-platform graphical layer over machete CLI
status: in-progress
priority: high
created: 2026-03-13
---

# MACH-0007: Machete GUI — cross-platform graphical layer over machete CLI

## Motivation

SourceTree is the go-to free git GUI for multi-repo management, but it's notoriously slow, crashes often, has no Linux support, and Atlassian shows little interest in improving it. The broader git GUI market has a clear gap: no single tool is **free, fast, cross-platform (Win/Mac/Linux), and supports multiple repos open simultaneously**.

| Tool | Free | Fast | All 3 OS | Multi-repo |
|------|------|------|----------|------------|
| SourceTree | Yes | No | No (no Linux) | Yes (tabs) |
| Fork | No ($50) | Yes | No (no Linux) | Yes (tabs) |
| GitKraken | No (private repos paywalled) | No (Electron) | Yes | Yes (tabs/workspaces) |
| Sublime Merge | Mostly | Yes | Yes | Partial (separate windows) |
| GitHub Desktop | Yes | Yes | No (no Linux officially) | No (single repo) |
| SmartGit | No (free for non-commercial only) | Yes | Yes | Yes |

Machete GUI would fill this gap: free, fast (Tauri), all 3 platforms, multi-repo tabs, and the only GUI built on top of an opinionated CLI with AI-native workflows.

## Vision

A focused git workflow tool — not a full git GUI trying to replace Fork or GitKraken. The unique angle is surfacing machete's CLI features visually:

- **AI-powered commits** — generate, review, and edit commit messages in the GUI
- **Smart pruning** — visual branch cleanup with squash-merge detection and safety classification
- **Release automation** — one-click release flow with version preview and changelog generation
- **Branch graph** — visual commit history with merge/squash-merge indicators
- **Multi-repo workspace** — tabbed interface with multiple repos open simultaneously

Think of it as "the git workflow tool with a face" rather than "another git GUI."

## Stack (Resolved)

### Tauri 2.0 + React 19 + Tailwind CSS

- **Backend**: Tauri 2.0 (Rust) — git operations implemented directly as Tauri commands via `std::process::Command` calling git CLI
- **Frontend**: React 19 + Tailwind CSS + Radix UI (shadcn/ui primitives)
- **Build**: Vite for frontend bundling, Cargo for Rust backend
- **File watching**: `notify` crate for live repo status updates
- **App size**: ~10 MB (vs Electron's 100+ MB)
- **Memory**: ~30-40 MB idle (vs Electron's 200-300 MB)
- **Startup**: Sub-second (vs Electron's 2-5 seconds)

#### Why React over Svelte?

React was chosen over the originally-recommended Svelte for practical reasons:
- Larger ecosystem of battle-tested components (Radix UI, shadcn/ui)
- More developers can contribute
- Better IDE tooling and TypeScript integration
- React 19's improvements close the DX gap with Svelte

#### Why not Electron?

GitKraken is Electron-based and its sluggishness is a cautionary tale. The whole point of this project is to be faster than SourceTree — using Electron would undermine that goal from day one.

#### Why not Qt/C++?

Fork and Gittyup use Qt. Native performance is great, but the development velocity is much slower, cross-platform UI consistency is harder, and the pool of developers who can contribute is smaller. Tauri gives native-like performance with web-frontend development speed.

## Architecture (Resolved)

### Direct Rust backend (not CLI shell-out)

The original plan proposed shelling out to the machete CLI from the Rust backend. In practice, git operations are implemented directly in Rust via `std::process::Command` calling git CLI commands. This avoids the overhead of spawning a Node.js process for every operation and gives the GUI sub-millisecond IPC latency.

The CLI and GUI share the same git concepts but have independent implementations:
- **CLI**: TypeScript in `src/lib/git.ts` — battle-tested, handles AI workflows, release automation
- **GUI**: Rust in `app/src-tauri/src/commands.rs` — optimized for responsiveness, exposes Tauri `invoke()` commands

This means the CLI stays useful for terminal users, while the GUI gets native-speed git operations without Node.js overhead. Long-term, migrating the CLI to Rust would unify the implementations (see open questions).

### Communication model

```
┌──────────────┐
│  React UI    │
│  (Vite)      │
└──────┬───────┘
       │ Tauri invoke()
       │ (IPC, type-safe)
┌──────▼───────┐
│  Rust Backend│  ──► git CLI (std::process::Command)
│  (Tauri 2)   │  ──► notify (file watcher)
└──────────────┘
```

### App version sync

The app version is read from the root `package.json` at build time via `tauri.conf.json` → `"version": "../../package.json"`. No manual sync needed — `machete release` bumps the version once and it flows to both CLI and GUI.

## Layout Design (Sourcetree-inspired)

The GUI uses a permanent panel layout (not a view-switcher). All core panels are visible
simultaneously, with draggable dividers so the user can resize to taste.

```
┌──────────────┬─────────────────────────────────────────────────┐
│  SIDEBAR     │  TOOLBAR    [ PR ] [ Prune ] [ Release ] [ ⚙ ] │
│              ├─────────────────────────────────────────────────┤
│  [Repo ▾]    │                                                 │
│              │  COMMIT LOG                                     │
│  ▾ Branches  │  (simple list Phase 1 → branch graph Phase 2)  │
│    main      │                                                 │
│    develop   │                                                 │
│  ● feature/* ├── drag ────────────────────────────────────────-┤
│              │                                                 │
│  ▾ Remotes   │  STAGING + DIFF                                 │
│    origin/   │  ┌─Staged──────┐  ┌─Diff─────────────────────┐ │
│              │  │             │  │                           │ │
│  ▾ Tags      │  ├─Unstaged────┤  │                           │ │
│    0.3.0     │  │             │  │                           │ │
│              │  └─────────────┘  └───────────────────────────┘ │
│  ▾ Stashes   ├── drag ────────────────────────────────────────-┤
│  (Phase 4)   │  COMMIT MESSAGE       [ AI ] [ Commit ] [ C&P] │
└──────────────┴─────────────────────────────────────────────────┘
```

### Sidebar (always visible)

- **Repo selector** — current repo name at top. Single repo Phase 1, multi-repo
  dropdown in Phase 3.
- **Branches** — local branches, current branch highlighted (bold / dot indicator).
  Click to checkout (Phase 2). Right-click for merge/rebase later.
- **Remotes** — collapsible tree of remote tracking branches.
- **Tags** — collapsible list of tags.
- **Stashes** — added in Phase 4.

### Top toolbar

Action-oriented workflows that don't need permanent screen space:

- **PR** — opens slide-over panel for AI-powered PR creation
- **Prune** — opens dialog/panel for safe branch cleanup
- **Release** — opens release automation flow (Phase 4)
- **Settings** (⚙) — opens settings as a dialog/modal

### Main area (three permanent resizable panels)

1. **Commit log** — Phase 1: simple commit list (hash, message, author, date).
   Phase 2: full branch graph with merge/squash-merge visualization.
2. **Staging + Diff** — file list (staged/unstaged with draggable split) and diff
   viewer (side by side with draggable split). All resizable.
3. **Commit message bar** — resizable textarea with AI generate button and
   commit/commit-and-push actions.

All three panel boundaries are draggable dividers.

## Feature Phases

### Phase 0: Prerequisites (CLI work)

- [x] Add `--json` output flag to all machete commands
- [x] Add `machete status` command (branch info, ahead/behind, dirty files)
- [x] Ensure all commands are non-interactive when piped (detect TTY)
- [x] Evaluate Tauri 2.0 with a hello-world app on all 3 platforms

### Phase 1: MVP — Sourcetree-style layout + commit workflow

Scope: A single-repo window with permanent panels matching the layout design above.

#### Layout & infrastructure
- [x] Tauri 2.0 app scaffold (React + Tailwind + shadcn/ui)
- [x] `machete gui` CLI command to launch app (`--dev` for hot-reload)
- [x] Rust backend with CLI bridge (`machete_command()`, PATH enrichment, ANSI stripping)
- [x] Draggable panel dividers (staged/unstaged, left/right, commit bar height)
- [x] localStorage persistence for repo path across HMR reloads
- [x] React ErrorBoundary for crash resilience
- [x] Sourcetree-style layout: sidebar explorer + toolbar + permanent panels
- [x] Sidebar: branch/remote/tag tree (read-only, shows current branch)
- [x] Toolbar: PR, Prune, Settings as action buttons
- [x] Commit log panel (top of main area, simple list)

#### Commit workflow
- [x] Repo open via folder picker
- [x] File status view (staged / unstaged) with diff stats
- [x] Diff viewer (unified, syntax-colored)
- [x] Stage/unstage individual files (checkbox toggle)
- [x] Stage all / unstage all
- [x] AI commit message generation (invoke `machete commit --json`)
- [x] Commit message editor (resizable)
- [x] Commit and Commit & Push buttons
- [x] Push/pull with remote status indicator

#### PR (toolbar action)
- [x] PR creation view with AI generation
- [x] Auto-detect base branch
- [x] Draft toggle
- [x] Move from full-page view to slide-over/dialog triggered by toolbar

#### Branch management (toolbar action)
- [x] Prune integration (`machete prune --json`)
- [x] Move from full-page view to dialog triggered by toolbar

### Phase 2: Branch management

- [x] Commit graph / history view (branch visualization replacing simple list)
- [x] Branch list with safety indicators (from `machete prune --json`)
- [x] One-click safe prune (with squash-merge detection shown visually)
- [x] Checkout / switch branches (click branch in sidebar)
- [x] Basic branch creation (CreateBranchDialog — name, source branch, checkout toggle)
- [x] Branch creation with machete naming conventions (see spec below)
- [x] Merge / rebase with conflict resolution UI (see spec below)

---

#### Spec: Branch creation with machete naming conventions

**Current state:** CreateBranchDialog exists with free-text name input, source branch selector, and checkout toggle. No naming conventions or structure.

**Goal:** Guide users toward consistent branch naming (`feature/MACH-NNNN-description`, `bugfix/description`, `hotfix/description`) while still allowing free-form names.

##### UI: Enhanced CreateBranchDialog

```
┌─ Create Branch ──────────────────────────────────────┐
│                                                      │
│  Branch type     [ feature ▾ ]                       │
│                  (feature / bugfix / hotfix / other)  │
│                                                      │
│  Story ID        [ MACH-     ]  (optional)           │
│                  Auto-suggests next available ID      │
│                                                      │
│  Description     [ my-feature-name ]                 │
│                  Auto-kebab-cases as you type         │
│                                                      │
│  ── Preview ──────────────────────────────────────── │
│  feature/MACH-0009-my-feature-name                   │
│  ────────────────────────────────────────────────── │
│                                                      │
│  Source branch   [ develop ▾ ]                       │
│  ☑ Checkout after creation                           │
│  ☐ Free-form name (disables type/story fields)       │
│                                                      │
│                        [ Cancel ]  [ Create Branch ]  │
└──────────────────────────────────────────────────────┘
```

##### Behavior

1. **Branch type selector** — dropdown with `feature`, `bugfix`, `hotfix`, `other`. Defaults to `feature`. Selecting `other` hides the story ID field and uses a single free-text input (current behavior).
2. **Story ID field** — optional. Shows `MACH-` prefix, user types just the number. Auto-suggests the next available ID by scanning existing branches and `docs/backlog/stories/`. If provided, becomes part of the branch name.
3. **Description field** — free text, auto-converted to kebab-case in real-time (spaces → hyphens, lowercase, strip invalid chars). Validated against git ref rules.
4. **Live preview** — shows the assembled branch name: `{type}/{story-id}-{description}` or `{type}/{description}` if no story ID.
5. **Free-form toggle** — checkbox that collapses type/story fields and shows a single name input (current behavior). For users who don't want conventions.
6. **Source branch default** — defaults to `develop` if it exists, otherwise current branch (matching the machete convention that features branch from develop).
7. **Validation** — reject if branch name already exists (local or remote). Show inline error.

##### Rust backend

New Tauri command: `get_next_story_id`
- Scans local branches for `MACH-NNNN` patterns
- Scans `docs/backlog/stories/` filenames for `MACH-NNNN` patterns
- Returns the next available sequential ID

Existing `create_branch` command is reused as-is — the frontend assembles the full branch name.

##### Keyboard shortcut

Keep existing `⌘⇧N` shortcut. When invoked from the sidebar context menu ("Create branch from..."), pre-fill the source branch.

---

#### Spec: Merge / rebase with conflict resolution UI

**Current state:** No merge or rebase UI. Merge only exists in the CLI's release command (`mergeNoFf`). No conflict detection or resolution.

**Goal:** Let users merge or rebase branches from the GUI with a clear, step-by-step conflict resolution flow when conflicts occur.

##### Entry points

1. **Sidebar context menu** — right-click a branch → "Merge into current branch..." or "Rebase current branch onto..."
2. **Branches view** — action button per branch row
3. **Toolbar merge button** — appears contextually when the current branch is behind its upstream or a target branch

##### UI: Merge/Rebase dialog

```
┌─ Merge ──────────────────────────────────────────────┐
│                                                      │
│  Merge  [ feature/MACH-0009-auth ▾ ]                │
│  into   develop (current branch)                     │
│                                                      │
│  Strategy   ○ Merge commit (--no-ff)                 │
│             ○ Fast-forward only (--ff-only)           │
│             ○ Squash (--squash)                       │
│                                                      │
│  ── Preview ──────────────────────────────────────── │
│  3 commits will be merged                            │
│  No conflicts detected (dry-run)                     │
│  ────────────────────────────────────────────────── │
│                                                      │
│                          [ Cancel ]  [ Merge ]        │
└──────────────────────────────────────────────────────┘
```

```
┌─ Rebase ─────────────────────────────────────────────┐
│                                                      │
│  Rebase   develop (current branch)                   │
│  onto     [ main ▾ ]                                 │
│                                                      │
│  5 commits will be replayed                          │
│                                                      │
│  ⚠ This rewrites commit history.                     │
│  Do not rebase branches that have been pushed        │
│  and shared with others.                             │
│                                                      │
│                          [ Cancel ]  [ Rebase ]       │
└──────────────────────────────────────────────────────┘
```

##### Merge strategies

| Strategy | Git command | When to use |
|----------|------------|-------------|
| Merge commit | `git merge --no-ff <branch>` | Default. Preserves full branch history. |
| Fast-forward only | `git merge --ff-only <branch>` | When you want a linear history and the branch is ahead. Fails if not possible. |
| Squash | `git merge --squash <branch>` | Collapse all commits into one. User writes the commit message. |

##### Rebase

- Command: `git rebase <target>`
- Shows warning about history rewriting
- If current branch has been pushed, show stronger warning: "This branch has been pushed to remote. Rebasing will require a force push."
- Detect if branch has remote tracking and is ahead of remote → warn

##### Conflict resolution flow

When merge or rebase hits conflicts:

```
┌─ Conflicts (3 files) ────────────────────────────────┐
│                                                      │
│  ⚠ Merge paused — resolve conflicts to continue     │
│                                                      │
│  ┌─ Conflicted files ─────────────────────────────┐  │
│  │ ⚡ src/lib/git.ts              [ Ours ] [ Theirs ] [ Open ] │
│  │ ⚡ src/commands/release.ts     [ Ours ] [ Theirs ] [ Open ] │
│  │ ✅ src/index.ts                (resolved)        │  │
│  └─────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ Diff ──────────────────────────────────────────┐  │
│  │ <<<<<<< HEAD                                    │  │
│  │ const version = "0.3.0";                        │  │
│  │ =======                                         │  │
│  │ const version = "0.4.0";                        │  │
│  │ >>>>>>> feature/release-bump                    │  │
│  └─────────────────────────────────────────────────┘  │
│                                                      │
│  [ Abort Merge ]            [ Continue Merge ]        │
└──────────────────────────────────────────────────────┘
```

**Phase 2 scope (this phase):**

1. **Conflicted file list** — show files with conflict markers, resolved status
2. **Accept ours / accept theirs** — per-file resolution buttons (`git checkout --ours/--theirs <file>`)
3. **Open in editor** — launch `$EDITOR` or system default for manual resolution
4. **Mark resolved** — `git add <file>` when user confirms resolution
5. **Abort** — `git merge --abort` or `git rebase --abort`
6. **Continue** — `git merge --continue` or `git rebase --continue`

**Deferred to Phase 4 (interactive rebase):**

- Inline diff editing (edit conflict markers in the GUI)
- Side-by-side 3-way merge view (base / ours / theirs)
- AI-assisted conflict resolution ("suggest resolution")
- Interactive rebase (reorder, squash, edit, drop commits)

##### Rust backend — new Tauri commands

| Command | Parameters | Description |
|---------|-----------|-------------|
| `merge_branch` | `repo_path`, `branch`, `strategy` (`no-ff`, `ff-only`, `squash`) | Execute merge, return success or conflict list |
| `rebase_branch` | `repo_path`, `onto` | Execute rebase, return success or conflict list |
| `get_conflict_files` | `repo_path` | List files with unresolved conflicts |
| `resolve_conflict` | `repo_path`, `file`, `resolution` (`ours`, `theirs`, `manual`) | Resolve a single file |
| `abort_merge` | `repo_path` | `git merge --abort` or `git rebase --abort` |
| `continue_merge` | `repo_path` | `git merge --continue` or `git rebase --continue` |
| `merge_preview` | `repo_path`, `branch` | Dry-run: count commits, detect potential conflicts |

##### Safety guardrails

- **Protected branches** — cannot merge INTO a protected branch from the GUI (mirrors machete convention). Show explanation: "main is a protected branch. Use a pull request instead."
- **Dirty working tree** — block merge/rebase if working tree is dirty. Show: "Commit or stash changes before merging."
- **Rebase warning** — if branch has been pushed and diverges from remote, show force-push warning before allowing rebase.
- **Abort is always available** — prominent abort button during conflict resolution. Never leave the user stuck in a half-merged state.

### Phase 3: Stash management & cherry-pick

Focus: essential git operations missing from the GUI.

#### Stash management
- [x] Rust backend: `list_stashes`, `create_stash`, `apply_stash`, `drop_stash` commands
- [x] Sidebar: "Stashes" section (collapsible, below Tags)
- [x] Stash list: message, age, file count per stash
- [x] Quick actions: apply, pop, drop (with confirmation for drop)
- [x] Create stash: toolbar button or `⌘⇧T` — message input, include-untracked toggle
- [x] Stash detail: click a stash to see its diff in the bottom panel

#### Cherry-pick
- [x] Rust backend: `cherry_pick` command
- [x] Commit log: right-click context menu → "Cherry-pick this commit"
- [x] Conflict handling: reuse existing merge/rebase conflict resolution UI
- [x] Success feedback: toast/banner showing cherry-picked commit hash

#### Bug fixes (Phase 3)
- [x] Prune triggers sidebar + commit log refresh after deleting branches
- [x] `⌘⇧R` refresh-all fetches remote and broadcasts to all panels (PR list, sidebar, log)
- [x] PR splash correctly distinguishes open/draft/merged/closed states
- [x] PR view always shows splash on sheet open, list state cached separately
- [x] Release keyboard shortcut changed from `⌘⇧E` to `⌘⇧X` (frees `⌘⇧R` conflict)

### Phase 4: Multi-repo & workspaces

- [ ] Tabbed interface for multiple repos (repo selector becomes tab bar)
- [ ] Workspace save/restore (remember which repos were open)
- [ ] Cross-repo branch overview (e.g. "which repos have uncommitted work?")
- [ ] Drag-and-drop tab reordering
- [ ] Tab context menu: close, close others, close all
- [ ] New tab button + recent repos list

### Phase 5: Polish & ecosystem

- [x] Dark/light theme (toggle in toolbar, persisted)
- [x] Keyboard shortcuts (comprehensive: push/pull/fetch/refresh/panels/branch ops)
- [x] Settings UI (appearance, protected branches, config viewer with sources)
- [x] App version footer in sidebar
- [ ] Settings: editable config values (not just read-only)
- [ ] Settings: keyboard shortcuts reference/customization section
- [ ] Auto-update mechanism (Tauri updater plugin)
- [ ] Plugin system for custom workflows
- [ ] Notification toasts for async operations (push/pull/fetch success/failure)

## Competitive Positioning

### What Machete GUI is NOT

- Not trying to be "the best git GUI" — that's a fight against Fork, Tower, and GitKraken with years of head start
- Not a generic git UI that wraps raw git commands

### What Machete GUI IS

- A **workflow tool** that happens to have git operations
- The only GUI with **AI-native** commit messages, changelogs, and PR descriptions
- The only GUI with **squash-merge-aware** branch safety analysis
- The only GUI built on an **opinionated CLI** (not libgit2 directly)
- **Free, fast, and cross-platform** — filling the market gap

### Differentiation summary

| Feature | Machete GUI | GitKraken | Fork | Sublime Merge |
|---------|-------------|-----------|------|---------------|
| AI commits | Core feature | Add-on | No | No |
| Smart prune | Squash-aware | Basic | Basic | No |
| Release automation | One-click | No | No | No |
| Performance | Tauri (~30 MB) | Electron (~300 MB) | Native (~50 MB) | Native (~30 MB) |
| Linux | Yes | Yes | No | Yes |
| Free | Yes | No (private repos) | No ($50) | Mostly |
| Multi-repo | Tabs | Tabs | Tabs | Windows |

## Resolved Decisions

1. **Frontend framework**: React 19 — larger ecosystem, Radix UI/shadcn primitives, better TypeScript tooling.
2. **Repo structure**: Monorepo — GUI lives in `app/` within `@frontier-collective/machete`.
3. **Git operations**: Direct Rust backend — Tauri commands call git CLI via `std::process::Command`. No Node.js overhead.
4. **Diff engine**: Unified diff rendered in React with syntax highlighting. No third-party diff library.
5. **Version sync**: `tauri.conf.json` reads version from root `package.json` at build time.

## Open Questions

1. **Monetization**: Stay free forever, or freemium with advanced features (team workspaces, enterprise SSO)?
2. **Rust CLI migration**: Rewrite the TypeScript CLI in Rust to share one codebase with the GUI backend? Would enable npm distribution via platform-specific binary packages (like esbuild/SWC).
3. **Linux/Windows**: macOS-first, but Tauri supports all 3 platforms. When to prioritize cross-platform testing?

## Research References

- **Tauri 2.0**: Sub-second startup, ~10 MB bundles, Rust backend + web frontend. Adoption up 35% YoY after 2.0 release.
- **Ariadne**: Git client being built with Tauri — validates the approach (under 1s startup, under 40 MB).
- **Fork**: Built by 2 people since 2017, consistently rated fastest GUI. Proves a small team can compete.
- **GitKraken**: Cautionary tale of Electron bloat. Also proves AI features (merge conflict resolution) have market demand.
- **Sublime Merge**: Fastest GUI, custom git reading library. Proves performance is a viable differentiator.
- **SourceTree market**: Millions of users stuck on a slow, neglected tool. Large addressable audience looking for alternatives.
