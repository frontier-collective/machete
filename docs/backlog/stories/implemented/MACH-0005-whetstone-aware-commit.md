---
id: MACH-0005
title: Whetstone-aware commit — smart staging and diff stats
status: done
priority: medium
created: 2026-03-13
---

# MACH-0005: Whetstone-aware commit — smart staging and diff stats

## Problem

When running `machete commit` in a project that uses Whetstone (`.whetstone/` directory), the staging prompt treated all unstaged files equally. Users had no way to exclude `.whetstone/whetstone.db` and other tooling files without manually staging files first. The commit command also didn't show which files were already staged, giving an incomplete picture.

## Solution

### Whetstone-aware staging

When unstaged files include `.whetstone/*` entries, the commit command now:

1. Separates files into regular and whetstone groups in the display
2. Shows whetstone files dimmed under a `── whetstone ──` separator
3. Presents a `selectOne` menu instead of a yes/no confirm:
   - **Stage all (exclude .whetstone)** — default option
   - **Stage all** — includes whetstone files
   - **Don't stage**

When no `.whetstone/` files are present, the original yes/no confirm flow is preserved.

### Diff stats display

Both staged and unstaged files now show per-file diff statistics:

- `+N` in green for added lines
- `-N` in red for removed lines
- `(binary)` for binary files
- `(new)` for untracked files

### Full file summary

The commit command now always shows both staged and unstaged files so the user gets a complete picture before deciding what to stage.

## Tasks

- [x] Add `getStagedDiffStats` and `getUnstagedDiffStats` to git.ts
- [x] Add `FileDiffStat` interface and `parseDiffNumstat` helper
- [x] Show staged files in green before unstaged section
- [x] Separate `.whetstone/*` files with dimmed separator
- [x] Replace yes/no confirm with `selectOne` menu when whetstone files present
- [x] Default to "Stage all (exclude .whetstone)"
- [x] Show `+N -N` diff stats on each file line

## Notes

- Uses `git diff --numstat` (cached and uncached) for stats
- Untracked files don't appear in `--numstat` output, so they're tagged `(new)` instead
- Binary files show `- -` in numstat output, detected and displayed as `(binary)`
