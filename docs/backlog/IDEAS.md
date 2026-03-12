# Ideas

Raw ideas for Machete improvements. Graduate to a story file in `stories/` when ready to pursue. When an idea is done (graduated or dropped), check the box and move it to the **Done** section at the bottom.

## Commands

- [ ] `MACH-0001` Add `machete branch` — create branches with consistent naming conventions (feature/, bugfix/, hotfix/) with optional ticket ID prefixes
- [ ] Add `machete log` — pretty-printed git log with graph, author coloring, and relative dates
- [ ] Add `machete sync` — fetch + rebase current branch onto its upstream, with stash/unstash around dirty trees
- [ ] Add `machete contributors` — auto-detect authors and contributors via gh API for README generation
- [ ] Add `machete release hotfix` — hotfix flow branching from master instead of develop
- [ ] Add `machete status` — dashboard-style overview: current branch, ahead/behind, stale branches, dirty files, last tag
- [ ] Add `machete diff` — AI-powered diff summary that explains what changed in plain English
- [ ] Add `machete pr` — create a GitHub PR with AI-generated title and description from the branch's commits
- [ ] Add `machete amend` — quick amend last commit with optional AI-regenerated message
- [ ] Add `machete undo` — safely undo the last commit (soft reset), with guard rails
- [ ] Add `machete stash` — named stashes with `machete stash save <name>` / `machete stash pop <name>`
- [ ] Add `machete changelog` — standalone changelog generation outside of the release flow (reuse existing lib)

## AI

- [ ] Add model selection config — allow switching between Claude models for commit/changelog generation
- [ ] Add commit message editing — let user tweak the AI-generated message in $EDITOR before committing
- [ ] Add scope detection — automatically suggest a commit scope based on changed files/directories
- [ ] Support local LLMs via Ollama as an alternative to the Anthropic API
- [ ] Add PR review summary — AI-powered summary of a PR's changes for reviewers
- [ ] Add commit message templates — user-defined prompt overrides for different projects or teams
- [ ] Token usage tracking — show estimated API cost per commit/release in verbose mode

## Configuration

- [ ] Add `machete config --unset` to remove a config key
- [ ] Support protected branch patterns (e.g. `release/*`, `hotfix/*`) not just exact names
- [ ] Add config validation on load — warn about unknown keys
- [ ] Add `machete config --edit` to open config file in $EDITOR
- [ ] Support `.macheterc` in YAML or TOML format as alternatives to JSON

## Infrastructure

- [ ] `MACH-0002` Add unit tests for config merging, arg parsing, branch filtering, and credential masking
- [ ] `MACH-0003` Add integration tests that exercise the full release flow in a temp git repo
- [ ] Add CI pipeline (GitHub Actions) for build + test on PRs
- [ ] Add shell completions (bash, zsh, fish) for machete commands and flags
- [ ] Add `--verbose` global flag for debug output across all commands
- [ ] Add `--no-push` flag to commit command to skip the push prompt
- [ ] Notify user when diff is truncated during commit/changelog generation
- [ ] Add `machete doctor` — check environment: git version, gh auth, node version, API key validity

---

## Done
