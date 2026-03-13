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

## Recommended Stack

### Tauri 2.0 (Rust backend + web frontend)

Tauri is the clear winner for this use case:

- **App size**: ~10 MB (vs Electron's 100+ MB)
- **Memory**: ~30-40 MB idle (vs Electron's 200-300 MB)
- **Startup**: Sub-second (vs Electron's 2-5 seconds)
- **Backend**: Rust — natural fit for git operations via `git2-rs` (Rust bindings for libgit2), or shelling out to the machete CLI
- **Frontend**: Any web framework (Svelte recommended for bundle size, React for ecosystem)
- **Platforms**: Windows, macOS, Linux (and mobile via Tauri 2.0)
- **Precedent**: "Ariadne" git client is being built with Tauri — starts in under 1 second, under 40 MB on disk

### Why not Electron?

GitKraken is Electron-based and its sluggishness is a cautionary tale. The whole point of this project is to be faster than SourceTree — using Electron would undermine that goal from day one.

### Why not Qt/C++?

Fork and Gittyup use Qt. Native performance is great, but the development velocity is much slower, cross-platform UI consistency is harder, and the pool of developers who can contribute is smaller. Tauri gives native-like performance with web-frontend development speed.

## Architecture

### CLI-first design

The GUI wraps the machete CLI rather than reimplementing git operations. This has several advantages:

1. **CLI stays useful** — users who prefer the terminal lose nothing
2. **Shared logic** — safety checks, AI prompts, config system are all in the CLI
3. **Testability** — CLI is already tested; GUI tests focus on UI only
4. **Incremental delivery** — GUI can ship features one at a time, falling back to CLI for the rest

### Communication model

```
┌──────────────┐       IPC / stdin-stdout       ┌──────────────┐
│  Tauri Shell │  ◄──────────────────────────►   │  machete CLI │
│  (Rust)      │                                 │  (Node.js)   │
└──────┬───────┘                                 └──────────────┘
       │ Tauri commands
       │ (invoke)
┌──────▼───────┐
│  Web UI      │
│  (Svelte)    │
└──────────────┘
```

Two integration approaches to evaluate:

1. **Shell out to machete CLI** — simplest, treats CLI as the source of truth. GUI parses structured output (JSON mode flag on CLI commands). Slower per-operation but zero duplication.
2. **Shared library** — extract machete's core logic into a library consumed by both CLI and GUI. Faster IPC but requires restructuring the codebase. Better long-term.

Recommend starting with approach 1 (shell out) and migrating to approach 2 if performance demands it.

### JSON output mode

Before the GUI can consume CLI output programmatically, machete commands need a `--json` flag that outputs structured data instead of ANSI-formatted text. This is a prerequisite.

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
- [ ] Branch creation with machete naming conventions (`machete branch`)
- [x] Checkout / switch branches (click branch in sidebar)
- [ ] Merge / rebase with conflict resolution UI

### Phase 3: Multi-repo & workspaces

- [ ] Tabbed interface for multiple repos (repo selector becomes tab bar)
- [ ] Workspace save/restore (remember which repos were open)
- [ ] Cross-repo branch overview (e.g. "which repos have uncommitted work?")
- [ ] Drag-and-drop tab reordering

### Phase 4: Release & advanced workflows

- [ ] Visual release flow (version picker, changelog preview, progress indicators)
- [ ] Interactive rebase
- [ ] Cherry-pick with visual commit selection
- [ ] Stash management (sidebar section + stash panel)
- [ ] PR integration (GitHub, Bitbucket) — view, create, merge

### Phase 5: Polish & ecosystem

- [x] Dark/light theme
- [ ] Keyboard shortcuts (vim-style optional)
- [ ] Settings UI (wrapping `.macheterc` config)
- [ ] Auto-update mechanism
- [ ] Plugin system for custom workflows

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

## Open Questions

1. **Frontend framework**: Svelte (smaller bundles, simpler) vs React (larger ecosystem, more developers)?
2. **Repo name**: Ship as part of `@frontier-collective/machete` monorepo or separate `machete-gui` repo?
3. **Monetization**: Stay free forever, or freemium with advanced features (team workspaces, enterprise SSO)?
4. **Diff engine**: Use an existing diff library (diff2html, monaco-diff) or build a custom high-performance one?
5. **Git operations**: Shell out to machete CLI (simple, slower) vs shared Rust/Node library (complex, faster)?

## Research References

- **Tauri 2.0**: Sub-second startup, ~10 MB bundles, Rust backend + web frontend. Adoption up 35% YoY after 2.0 release.
- **Ariadne**: Git client being built with Tauri — validates the approach (under 1s startup, under 40 MB).
- **Fork**: Built by 2 people since 2017, consistently rated fastest GUI. Proves a small team can compete.
- **GitKraken**: Cautionary tale of Electron bloat. Also proves AI features (merge conflict resolution) have market demand.
- **Sublime Merge**: Fastest GUI, custom git reading library. Proves performance is a viable differentiator.
- **SourceTree market**: Millions of users stuck on a slow, neglected tool. Large addressable audience looking for alternatives.
