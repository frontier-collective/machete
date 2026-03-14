---
id: MACH-0002
title: Unit tests for core modules
status: draft
priority: high
created: 2026-03-13
---

# MACH-0002: Unit tests for core modules

## Problem

Machete has zero test coverage. The tool performs destructive git operations (branch deletion, force pushes, version bumps) and relies on complex logic for config merging, argument parsing, branch filtering, and credential routing. Any regression in these areas could silently break workflows or cause data loss.

## Solution

Add co-located unit tests (`*.test.ts`) for the four core modules that contain non-trivial logic: config merging, argument parsing, branch filtering, and credential masking. Tests use Node's native test runner (`node --test`) and `node:assert` — no external test frameworks.

Tests that interact with git or the filesystem should use isolated temp directories. Tests for pure functions (arg parsing, camelCase) need no setup.

## Tasks

### `src/cli/args.test.ts` — argument parsing

- [ ] Long flag with space value: `--remote origin` → `{ remote: "origin" }`
- [ ] Long flag with `=` value: `--dry-run=true` → `{ dryRun: "true" }`
- [ ] Long flag no value (boolean): `--force` → `{ force: true }`
- [ ] Short flag with value: `-r origin` → `{ r: "origin" }`
- [ ] Short flag no value: `-i` → `{ i: true }`
- [ ] Kebab-to-camelCase: `--no-publish` → `{ noPublish: true }`
- [ ] Multi-hyphen: `--api-key-name foo` → `{ apiKeyName: "foo" }`
- [ ] Positional args in `_` array: `release minor` → `{ _: ["release", "minor"] }`
- [ ] Mixed positional and flags: `prune --dry-run --remote origin` → `{ _: ["prune"], dryRun: true, remote: "origin" }`
- [ ] Empty argv → `{ _: [] }`
- [ ] Flag followed by flag (no value consumed): `--foo --bar` → `{ foo: true, bar: true }`

### `src/lib/config.test.ts` — config merging and credential routing

- [ ] `loadConfig()` returns defaults when no config files exist
- [ ] Global config overrides defaults
- [ ] Local config overrides global config
- [ ] Credentials file merges correctly in precedence order
- [ ] Invalid JSON in a config file is silently skipped (returns `{}`)
- [ ] `writeConfigValue()` routes credential keys to secrets files
- [ ] `writeConfigValue()` routes non-credential keys to config files
- [ ] `addToArray()` deduplicates — adding an existing item is a no-op
- [ ] `addToArray()` initializes empty array if key missing
- [ ] `removeFromArray()` removes item and preserves others
- [ ] `removeFromArray()` on missing key returns empty array
- [ ] Credential masking: first 8 chars visible, rest replaced with `****`

### `src/commands/prune.test.ts` — branch filtering logic

- [ ] Current branch is never included in stale list
- [ ] Protected branches are skipped and reported separately
- [ ] Branch with remote equivalent is not flagged as stale
- [ ] Branch without remote equivalent is flagged as stale
- [ ] Dry run lists branches without deleting
- [ ] Force mode skips confirmation prompt
- [ ] Empty stale list exits early with info message

### `src/lib/git.test.ts` — git helpers with logic

- [ ] `getLocalBranches()` strips quotes and filters empty lines
- [ ] `getRemoteBranches()` filters by remote prefix and removes HEAD
- [ ] `getUnstagedFiles()` deduplicates modified + untracked
- [ ] `getStagedDiff()` truncates at 100k characters with message
- [ ] `getStagedDiff()` passes through diffs under 100k unchanged

## Notes

- All tests use `node:test` (`describe`, `it`, `beforeEach`, `afterEach`) and `node:assert/strict`.
- Config and prune tests need temp directories with mock git repos. Use `mkdtempSync` in `beforeEach` and clean up in `afterEach`.
- Git helper tests that call real git commands need a temp repo initialized with `git init`.
- Arg parsing and camelCase tests are pure functions — no setup needed.
- The test script in `package.json` is already configured: `"test": "node --test dist/**/*.test.js"`.
