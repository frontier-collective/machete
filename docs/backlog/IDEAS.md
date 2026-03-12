# Ideas

Raw ideas for Machete improvements. Graduate to a story file in `stories/` when ready to pursue. When an idea is done (graduated or dropped), check the box and move it to the **Done** section at the bottom.

## Commands

- [ ] Add `machete branch` — create branches with consistent naming conventions (feature/, bugfix/, hotfix/)
- [ ] Add `machete log` — pretty-printed git log with graph, author, and date formatting
- [ ] Add `machete sync` — fetch + rebase current branch onto its upstream
- [ ] Add `machete contributors` — auto-detect authors and contributors via gh API for README generation
- [ ] Support `machete release hotfix` — hotfix flow branching from master instead of develop

## AI

- [ ] Add model selection config — allow switching between Claude models for commit/changelog generation
- [ ] Add commit message editing — let user tweak the AI-generated message before committing
- [ ] Add scope detection — automatically suggest a scope based on changed files/directories
- [ ] Support local LLMs via Ollama as an alternative to the Anthropic API

## Configuration

- [ ] Add `machete config --unset` to remove a config key
- [ ] Support per-branch protected branch patterns (e.g. `release/*`)
- [ ] Add config validation on load — warn about unknown keys

## Infrastructure

- [ ] Add integration tests that exercise the full release flow in a temp git repo
- [ ] Add CI pipeline (GitHub Actions) for build + test on PRs
- [ ] Add shell completions (bash, zsh, fish) for machete commands and flags

---

## Done
