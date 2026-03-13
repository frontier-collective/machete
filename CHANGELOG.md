# Changelog

All notable changes to Machete are documented here.

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

