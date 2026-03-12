# Changelog

All notable changes to Machete are documented here.

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

