# Changelog

All notable changes to Machete are documented here.

## [0.5.2] - 2026-03-14

There are no commits or diff stat provided for this release — the fields appear to be empty.

Could you share the commit log and/or diff stat? Once you do, I'll write the release notes right away.


## [0.5.1] - 2026-03-14

### Features

- Add in-app auto-updater that checks for new versions on launch, on a 30-minute interval, and when the window regains focus — a banner prompts you to download and install with a live progress indicator, then relaunches automatically
- Add About dialog with a manual "Check for updates" option that surfaces errors when triggered by the user
- Sign release artifacts to support secure update delivery

### Internal

- Remove the app-build job from the CI workflow now that it is covered by the release pipeline


## [0.5.0] - 2026-03-14

### Features

- Add a **multi-repo tab system** — open multiple repositories side-by-side with drag-to-reorder, custom tab labels, and full session persistence across restarts
- Add **status indicators** on tabs showing dirty (uncommitted changes) and unpushed commit states at a glance
- Add **PR indicators** on the branch list, surfacing open pull requests via `gh` CLI without leaving the app
- Add **optimistic UI updates** — checking out a branch updates its classification instantly, and creating a PR reflects in the sidebar immediately
- Add **arrow key navigation** for the commit log and file diff panels
- Add **About dialog** with native menu integration and app health checks
- Add **branch promote-to-safe** action to permanently mark a branch as protected from pruning
- Add **`⌘↑` shortcut** to quickly jump to the top of the commit log

### Improvements

- Show a **loading spinner** per tab during background operations (fetch, classification, etc.)
- Cache branch classification in `localStorage` so the branch list renders immediately on load, then refreshes in the background
- Skip the intro screen automatically when a session with open tabs is restored
- Improve keyboard shortcut handling so inactive tabs never intercept keystrokes

### Fixes

- Fix protected branches being incorrectly listed as "current" instead of "protected" during prune when both conditions apply
- Fix scroll overflow in the branch and commit panels
- Ensure branch classification refreshes correctly on initial load


## [0.4.0] - 2026-03-14

### Features

- Add **Machete Desktop App** — a native Tauri-based GUI for macOS (and other platforms) built with React and shadcn/ui, installable as `Machete.app`
- Add commit graph with branch visualization, virtual commit log, and commit detail view
- Add staging area with optimistic staging, stash management, and cherry-pick support
- Add branch management with checkout, create-branch, pull/fetch, merge/rebase dialogs, and context menus
- Add PR view with open and closed/merged pull requests, redesigned layout, and AI-assisted PR creation
- Add release view for managing version bumps and changelogs from the GUI
- Add keyboard shortcuts throughout the GUI with tooltips showing keybinding hints
- Add remote tracking indicators and branch list tooltips
- Add markdown rendering and popover support in the GUI
- Add `machete status` command — shows branch, staged/unstaged files, and ahead/behind counts; supports `--json`
- Add `machete gui` command — launches the installed Machete desktop app (or starts a dev server with `--dev`)
- Add `--json` output mode to `commit`, `pr`, `prune`, `release`, and `config --list` commands for programmatic/GUI consumption
- Add DMG build and GitHub release asset upload support to the `release` command

### Improvements

- Virtualize the diff viewer and commit log for performance with large repositories
- Split React context into targeted slices to avoid unnecessary re-renders across the GUI
- Persist panel layout (sidebar width, split pane sizes, open sections) per repository across sessions
- Add configurable diff context lines setting in the GUI

### Fixes

- Fix copy-only diffs by synthesizing a new-file diff when no hunks are present
- Improve CLI and git binary resolution, error boundaries, and surface actionable error messages in the GUI

### Documentation

- Add `INSTALLATION.md` with setup instructions for both the CLI and the desktop app, including a macOS Gatekeeper workaround
- Update `README.md` and `CLAUDE.md` to document the desktop app

### Internal

- Add GitHub Actions workflows for CI and cross-platform releases (macOS arm64/x86, Linux x64/arm64, Windows)
- Cross-compile macOS Intel builds on ARM runners; drop AppImage from Linux ARM (no `xdg-open` support)
- Build and verify DMG artifact in CI; document Gatekeeper workaround in workflow
- Bump `actions/checkout` and `actions/setup-node` to v5 across all workflows


## [0.3.0] - 2026-03-13

### Features

- Add `machete pr` command to create GitHub pull requests with AI-generated titles and descriptions, including `--draft`, `--dry-run`, `--noai`, `--base`, `--title`, and `--body` options
- Add interactive version selection for `machete release` — omitting the bump argument now prompts with a menu showing current → next version for each option

### Improvements

- Improve Ctrl+C handling across all interactive prompts — readline interfaces now exit cleanly instead of hanging
- Add explicit `process.exit(0)` after command completion to prevent background HTTP connection pools (e.g. Anthropic SDK) from stalling the process

### Fixes

- Fix `gh pr create` to use safe argument passing via `execFileSync` instead of shell interpolation, preventing issues with special characters in titles or bodies


## [0.2.0] - 2026-03-13

### Features

- Add safe pruning to `machete prune` — branches are now classified before deletion, keeping any branch with unmerged or unpushed work and detecting squash-merged branches as safe to remove
- Add diff stat display to `machete commit` — staged and unstaged files now show line-level `+`/`-` counts inline when reviewing changes before committing
- Add `.whetstone/` file filtering in `machete commit` — whetstone files are grouped separately when prompting to stage, with an option to stage all changes excluding them

### Improvements

- Replace `--force` flag on `prune` with `-n`/`--no-interaction` for scripting use; the prune summary now shows a full breakdown of kept, protected, deletable, and unsafe branches before acting
- Update `prune` help text to reflect new flag names and safer default behaviour


## [0.1.3] - 2026-03-12

### Features

- Prompt to push to origin after a successful AI-powered commit, streamlining the commit → push workflow

### Internal

- Add unit tests for argument parsing, config loading/writing, and core git operations
- Add integration tests covering the full release flow, changelog generation, and edge cases
- Export `computeNextVersion` from the release module to support direct testing
- Initialize Whetstone database for constraint and decision tracking

### Documentation

- Add a lightweight backlog system with a `README`, `IDEAS.md`, agent instructions, and initial story stubs for the `branch` command, unit tests, and integration tests


## [0.1.2] - 2026-03-12

### Fixes

- Fix `--dry-run` mode for changelog generation to print the new changelog entry instead of silently skipping it


## [0.1.1] - 2026-03-12

### Fixes

- Fix `release --dry-run` to display the real computed next version (e.g. `v0.1.0 → v0.1.1`) instead of a placeholder suffix

### Improvements

- Default confirmation prompts for push, GitHub release, and npm publish steps to **yes**, so pressing Enter accepts the suggested action

### Documentation

- Add `commit` and `release` command docs to the README, including usage examples and available flags
- Add an Authors section to the README


## [0.1.0] - 2026-03-12

### Features

- Add `machete commit` — generates AI-powered commit messages from staged changes using Claude, with Conventional Commits formatting and dry-run support
- Add `machete prune` — detects and deletes local branches with no remote equivalent, with dry-run, force, and interactive selection modes
- Add `machete release` — full git-flow release automation: version bump, AI-generated changelog, branch/tag management, GitHub release creation, and npm publish
- Add `machete config` — read and write configuration values across global and local scopes, with separate credential storage and masked output for secrets
- Add `machete init` — scaffolds a `.macheterc` in the current repository with sensible defaults and remote auto-detection
- Add AI changelog generation via Claude with automatic fallback to raw git log when no API key is available

### Fixes

- Fix git merge and tag operations to use temp files for messages, avoiding shell escaping issues with multiline or special-character content
- Fix changelog range computation to fall back to the root commit when no tags exist, ensuring all commits are captured on first release

### Internal

- Add postinstall script that creates `~/.machete/` on install, cross-platform
- Add standalone `scripts/changelog.mjs` for generating `CHANGELOG.md` outside the release flow, with the same Claude/fallback logic

