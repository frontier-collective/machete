---
id: MACH-0003
title: Integration tests for release flow
status: draft
priority: high
created: 2026-03-13
---

# MACH-0003: Integration tests for release flow

## Problem

The release command orchestrates a complex multi-step git-flow pipeline: version bump → changelog generation → branch creation → merge to master → tag → merge back to develop → push → GitHub release → npm publish. A failure at any step can leave the repository in a broken state (orphaned branches, wrong version in package.json, incomplete merges). There's currently no automated way to verify this flow works end-to-end.

## Solution

Add integration tests that exercise the full release pipeline in isolated temporary git repositories. Each test creates a fresh repo with the required branch structure (master + develop), seed commits, and a valid package.json. Tests run the release command programmatically and verify the resulting git state (branches, tags, commit history, file contents).

AI changelog generation and external operations (push, gh release, npm publish) are excluded from integration tests — the tests use `--noai --no-publish` flags and verify local git state only.

## Tasks

### Test infrastructure

- [ ] Create `src/commands/release.test.ts`
- [ ] Write a `createTestRepo()` helper that sets up a temp git repo with:
  - `git init` with initial commit
  - `master` and `develop` branches
  - A valid `package.json` with version `1.0.0`
  - A `CHANGELOG.md` with initial entry
  - At least 2-3 seed commits on develop
- [ ] Write a `cleanupTestRepo()` helper that removes the temp directory
- [ ] Stub interactive prompts (confirm) to auto-accept or auto-decline

### Release flow tests

- [ ] Patch release: verify version bumps from `1.0.0` to `1.0.1`
- [ ] Minor release: verify version bumps from `1.0.0` to `1.1.0`
- [ ] Major release: verify version bumps from `1.0.0` to `2.0.0`
- [ ] Verify release branch `release/X.Y.Z` is created and deleted after merge
- [ ] Verify tag `vX.Y.Z` exists on master after release
- [ ] Verify master contains the merge commit from release branch
- [ ] Verify develop contains the merge-back commit from release branch
- [ ] Verify `package.json` version is updated in both master and develop
- [ ] Verify `CHANGELOG.md` has the new version entry prepended
- [ ] Verify final working branch is develop (not master or release branch)

### Pre-flight validation tests

- [ ] Fails when not on develop branch
- [ ] Fails when working tree is dirty
- [ ] Fails with invalid bump argument
- [ ] Fails with no bump argument

### Dry-run tests

- [ ] Dry run does not modify any git state (no branches, tags, or file changes)
- [ ] Dry run computes correct next version (`computeNextVersion`)
- [ ] Dry run outputs changelog preview

### Edge cases

- [ ] First release (no previous tags) — range falls back to root commit
- [ ] Release with no commits since last tag — changelog is empty but flow completes

## Notes

- Tests run with `--noai` to skip the Anthropic API call and use raw git log for changelog.
- Tests run with `--no-publish` to skip push, GitHub release, and npm publish prompts.
- The `confirm()` function in `src/cli/prompt.ts` reads from stdin — tests need to either mock it or pipe responses. Consider extracting the prompt into an injectable dependency or using environment variable to auto-accept.
- Each test should `process.chdir()` into the temp repo before running and restore after.
- These tests will be slower than unit tests (~1-2s each for git operations). Keep the test count focused on critical paths.
- Build must pass (`npm run build`) before tests can run since tests execute compiled JS.
