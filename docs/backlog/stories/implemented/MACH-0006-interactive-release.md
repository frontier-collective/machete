---
id: MACH-0006
title: Interactive version selection for machete release
status: done
priority: medium
created: 2026-03-13
---

# MACH-0006: Interactive version selection for machete release

## Problem

Running `machete release` without a bump type argument exits with a usage error. The user has to remember the exact syntax and mentally compute what the next version will be. This is friction that could be a guided prompt instead.

## Solution

When `machete release` is invoked with no bump argument, present a `selectOne` menu showing each bump type with a version preview computed from the current `package.json` version:

```
Select release type:

  1) patch  0.1.3 → 0.1.4
  2) minor  0.1.3 → 0.2.0
  3) major  0.1.3 → 1.0.0

Select [1]:
```

Default is `patch` (option 1). Once the user selects, the release continues with the chosen bump type through the normal flow (pre-flight checks, build, test, changelog, tag, etc.).

Explicit argument (`machete release patch`) still works and skips the prompt entirely.

## Tasks

- [x] Read current version from `package.json` via `readVersionFromDisk()` when no bump arg provided
- [x] Compute all three next versions using `computeNextVersion()`
- [x] Present `selectOne` menu with formatted version transitions
- [x] Pass selected bump type into the existing release flow
- [ ] Add test: release with no args prompts and proceeds

## Notes

- `readVersionFromDisk()` and `computeNextVersion()` already exist in `release.ts`
- `selectOne` from `cli/prompt.ts` defaults to item 1, which maps to `patch`
- Pre-flight checks (branch, clean tree, build, test) run after selection — no wasted work if the user cancels
- Invalid explicit args should still show the usage error, not the prompt
