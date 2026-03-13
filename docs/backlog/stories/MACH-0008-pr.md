---
id: MACH-0008
title: machete pr — AI-powered pull request creation
status: ready
priority: high
created: 2026-03-13
---

# MACH-0008: machete pr — AI-powered pull request creation

## Problem

Creating a pull request involves switching to a browser, writing a title and description from memory, and often producing inconsistent or sparse PR descriptions. The branch already contains all the context needed — commit messages, diff stats, branch name — but assembling that into a good PR description is tedious manual work.

## Solution

`machete pr` gathers branch context (commits, diff, branch name), sends it to Claude for title and body generation, previews the result, and creates the PR via `gh pr create`.

### Flow

```
machete pr

ℹ Base branch: develop (from remote)
ℹ 3 commits, 6 files changed (+142 -38)

ℹ Generating PR...

  Title: Add squash-merge detection to prune command

  ## Summary
  - Add 3-phase commit reachability check to prune safety classification
  - Detect squash-merged branches via combined diff patch-id comparison
  - Update display to show "squash-merged → develop" for detected branches

  ## Changes
  - `src/lib/git.ts` — add `isBranchSquashMergedInto`, `parseCherryOutput`, update `classifyBranchSafety`
  - `src/lib/types.ts` — add `squashMergedInto` to `BranchSafetyResult`
  - `src/commands/prune.ts` — update display formatters and pass new args

  ## Test plan
  - [ ] Run `machete prune --dry-run` on repo with squash-merged branches
  - [ ] Verify squash-merged branches show as safe to delete
  - [ ] Run full test suite

Edit before creating? (y/N)
Create PR? (Y/n)
✓ https://github.com/frontier-collective/machete/pull/42
```

### Flags

- `--draft` — create as draft PR
- `--dry-run` — show preview without creating
- `--base <branch>` — override base branch
- `--noai` — skip AI generation, prompt for title/body manually
- `--title <text>` — override AI-generated title (skips AI for title only)
- `--body <text>` — override AI-generated body (skips AI for body only)

### Base Branch Detection

Order of precedence:

1. `--base <branch>` flag (explicit override)
2. `prBaseBranch` config key in `.macheterc` (skips prompt if set)
3. Auto-detect from remote default branch via `gh repo view --json defaultBranchRef` → prompt user to confirm

When auto-detected, the user is shown the detected base and asked to confirm:

```
Base branch: develop (from remote default)
Use this base? (Y/n)
```

If the user says no, they're prompted to enter a branch name.

When `prBaseBranch` is set in config, no prompt — it's used directly. This is the zero-friction path for repos with a consistent base branch.

### Push Handling

Before creating the PR, check if the current branch has been pushed to the remote:

1. If branch exists on remote and is up to date → proceed
2. If branch exists on remote but is behind → ask "Push N new commits to origin? (Y/n)"
3. If branch has never been pushed → ask "Branch not on remote. Push to origin? (Y/n)"
4. If user declines push → abort with info message

### Edit Before Submit

After AI generates the title and body:

1. Show full preview (title + body) in the terminal
2. Ask "Edit before creating? (y/N)" (default: no)
3. If yes → open `$EDITOR` (or `$VISUAL`, fallback to `vi`) with a temp file containing the title on line 1, blank line, then body
4. Parse edited file: line 1 = title, rest = body
5. Then ask "Create PR? (Y/n)" (default: yes)

### AI Prompt Design

Context gathered for Claude:

- **Branch name** — often contains ticket ID and feature description
- **All commit messages** since diverging from base branch
- **Diff stat** — files changed with line counts (not full diff — too large for PRs)
- **File list with diff stats** — so AI can describe what changed where

Prompt rules:

- Title: concise, imperative mood, under 70 characters, no ticket prefix (gh adds those)
- Body: structured with Summary (1-3 bullets), Changes (per-file descriptions), Test plan (checklist)
- Tone: professional, specific, no filler
- Max 2048 tokens response

## Configuration

### New config key: `prBaseBranch`

Added to `MacheteConfig`:

```typescript
prBaseBranch?: string;
```

Not a credential key — stored in `.macheterc` (local or global). Overrides auto-detection and skips the base branch prompt.

Example `.macheterc`:
```json
{
  "protectedBranches": ["main", "master", "develop"],
  "defaultRemote": "origin",
  "prBaseBranch": "develop"
}
```

## Pre-flight Checks

In order:

1. Is this a git repo?
2. Is `gh` installed? → error with install instructions if not
3. Is `gh` authenticated? → error with `gh auth login` instructions if not
4. Is `anthropicApiKey` configured? → error if not (unless `--noai`)
5. Is the current branch a protected branch? → error "Cannot create PR from protected branch"
6. Is the working tree clean? → warning only (don't block, but inform)

## Tasks

- [ ] Add `prBaseBranch` to `MacheteConfig` in types.ts
- [ ] Add git helpers: `getCommitsSinceBase(base)`, `getDiffStatSinceBase(base)`, `getRemoteDefaultBranch(remote)`, `branchExistsOnRemote(branch, remote)`, `pushBranch(branch, remote)`
- [ ] Build AI prompt for PR generation (`buildPrPrompt`)
- [ ] Create `src/commands/pr.ts` with `runPr()` function
- [ ] Implement base branch detection (flag → config → auto-detect → prompt)
- [ ] Implement push detection and prompt
- [ ] Implement AI generation with preview
- [ ] Implement edit flow (`$EDITOR` with temp file)
- [ ] Create PR via `gh pr create` with title and body
- [ ] Add command routing in index.ts
- [ ] Add help text in help.ts
- [ ] Add tests

## Notes

- Uses `gh pr create` under the hood — no direct GitHub API calls needed
- `gh` handles authentication, repo detection, and PR creation
- The `--title` and `--body` flags match `gh pr create` flags for familiarity
- Full diff is NOT sent to Claude (too large for multi-commit PRs) — only diff stats and commit messages
- Future enhancement: PR body templates via `.machete/pr-template.md` (see IDEAS.md)
