---
id: MACH-0004
title: Safe prune — verify work exists elsewhere before deleting
status: in-progress
priority: high
created: 2026-03-13
---

# MACH-0004: Safe prune — verify work exists elsewhere before deleting

## Problem

The `machete prune` command uses `git branch -D` (force delete) on any local branch without a same-named remote. This can destroy work that exists nowhere else — branches that were never pushed, or branches with extra local commits after their remote was deleted. The user has no visibility into whether a branch is safe to delete before it's gone.

## Solution

Make prune always safe. Before deleting any branch, verify that ALL its commits are reachable from:

1. At least one remote ref (work is on the remote)
2. At least one local branch NOT also being pruned (work survives locally)

Display a full summary of every local branch with color-coded status and stats so the user knows exactly what will happen. Only safe branches are ever deleted — there is no `--force` override.

### Flags

- `--dry-run` — show the full summary without deleting
- `--remote <name>` — remote to compare against (default: from machete config)
- `-i, --interactive` — select which safe branches to delete
- `-n, --no-interaction` — skip confirmation prompt (for scripting)

### Output

Every local branch is displayed in the summary:
- **Kept** branches (current, on remote) — green checkmark
- **Protected** branches — green checkmark, dimmed
- **Safe to delete** — red × with merge target info
- **Keeping (unmerged work)** — yellow warning with commit counts

## Tasks

- [x] Add `BranchSafetyResult` type and update `PruneOptions`/`PruneResult`
- [x] Add git safety functions: `getUnpushedCommits`, `getCommitsNotOnOtherBranches`, `getBranchMergeTargets`, `classifyBranchSafety`, `deleteBranchSafe`, `isBranchSquashMergedInto`
- [x] Add format helpers: `keptBranchList`, `deletableBranchList`, `unsafeBranchList`
- [x] Rewrite prune command with safety classification flow
- [x] Update help text with new flag descriptions
- [ ] Add unit tests for git safety functions
- [ ] Add integration tests for prune command

## Notes

- `--force` has been removed entirely. Prune is always safe by design.
- Uses `git branch -d` (lowercase) as an additional safety net — git itself will refuse to delete unmerged branches.
- The `--no-interaction` / `-n` flag replaces the old `--force` (skip confirmation) behavior, but only for safe branches.
- Squash-merge detection uses a 3-phase approach: (1) hash-identity check, (2) `git cherry` for 1:1 commit matching, (3) combined diff patch-id comparison for multi-commit squash merges.
- The combined diff approach compares the total patch-id of all branch commits against individual commit patch-ids on target branches, correctly detecting GitHub squash merges.
