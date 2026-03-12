---
id: MACH-0001
title: Branch command with naming conventions
status: draft
priority: high
created: 2026-03-13
---

# MACH-0001: Branch command with naming conventions

## Problem

Creating branches manually means inconsistent naming across the team. Some developers write `feature/add-login`, others write `feat-add-login` or `add-login`. There's no enforcement of conventions and no connection between branch names and ticket/story IDs. Git-flow tools exist but they're heavy — machete should offer a lightweight alternative that enforces conventions without the overhead.

## Solution

Add a `machete branch` command that creates and checks out branches with consistent naming conventions. Supports standard prefixes (`feature/`, `bugfix/`, `hotfix/`, `chore/`, `release/`) and optional ticket ID embedding. The base branch is inferred from the type (features branch from `develop`, hotfixes from `master`) but can be overridden.

### Usage

```bash
# Create a feature branch
machete branch feature my-new-feature
machete branch feature my-new-feature --from main

# With a ticket/story ID
machete branch feature MACH-0042 add-dark-mode
# → feature/MACH-0042-add-dark-mode

# Shorthand aliases
machete branch fix login-redirect
machete branch hotfix urgent-patch
machete branch chore update-deps

# List branch naming conventions
machete branch --help
```

### Branch type → base branch defaults

| Type | Prefix | Default base |
|------|--------|-------------|
| feature | `feature/` | `develop` |
| bugfix/fix | `bugfix/` | `develop` |
| hotfix | `hotfix/` | `master` |
| chore | `chore/` | `develop` |
| release | `release/` | `develop` |

### Naming rules

- Branch names are kebab-cased automatically (spaces and underscores converted)
- Ticket IDs are uppercased and prefixed: `feature/MACH-0042-description`
- Invalid characters are stripped
- Empty descriptions after sanitization are rejected

## Tasks

- [ ] Add `src/commands/branch.ts` with `runBranch(args)` export
- [ ] Implement branch type parsing and validation (feature, bugfix/fix, hotfix, chore, release)
- [ ] Implement name sanitization — kebab-case, strip invalid chars, validate non-empty
- [ ] Implement optional ticket ID detection (first arg matches pattern like `MACH-0042`, `JIRA-123`, etc.)
- [ ] Implement base branch inference with `--from` override
- [ ] Fetch latest from remote before branching (configurable via `--no-fetch`)
- [ ] Register command in `src/index.ts`
- [ ] Add help text and examples in `src/cli/help.ts`
- [ ] Add unit tests for name sanitization and branch type resolution
- [ ] Update README with `machete branch` documentation

## Notes

- The ticket ID pattern should be configurable in `.macheterc` (e.g. `branchPrefix: "MACH"`) but this can be a follow-up.
- `machete branch release` overlaps with `machete release` — the branch command just creates the branch, the release command runs the full pipeline. They're complementary.
- Consider adding `machete branch --list` as a prettier alternative to `git branch` in a future iteration.
