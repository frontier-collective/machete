# Machete

Git toolset — CLI (`@frontier-collective/machete`) + native macOS desktop app (Tauri 2)

## Quick Reference

### CLI
- **Build:** `npm run build` (just `tsc`)
- **Dev:** `npm run dev` (tsc --watch)
- **Test:** `npm test` (node --test)
- **Run locally:** `node dist/index.js <command>`

### Desktop App
- **Dev:** `make app-dev` (Vite hot reload + Rust backend)
- **Build .app:** `make app-build`
- **Build .dmg:** `make app-dmg`
- **All targets:** `make help`

## Key Decisions

### CLI
- Node 22+ required (use modern APIs freely)
- ES modules throughout — always use `.js` extensions in imports
- No linters/formatters/bundlers — just TypeScript
- Manual CLI arg parsing — no third-party CLI frameworks
- Follow Whetstone patterns (see `~/Development/whetstone/`)
- ANSI colors directly — no chalk/kleur
- Tests use Node native test runner, co-located as `*.test.ts`

### Desktop App
- Tauri 2 + React 19 + Tailwind CSS + Radix UI
- Frontend in `app/src/`, Rust backend in `app/src-tauri/`
- Git operations implemented as Tauri commands in `commands.rs`
- File watcher (notify crate) for live repo status updates
- App version synced from root `package.json` via `tauri.conf.json`
- Native macOS title bar with overlay style and traffic light positioning

## CLI Commands

- `machete init` — Initialize `.macheterc` in the current repo (detects remotes)
- `machete config` — Read/write config values; credentials auto-route to secrets files
- `machete commit` — AI-powered commit messages via Claude (Conventional Commits format)
  - `--dry-run`
- `machete release` — Full git-flow release: version bump, changelog, branch/tag management, GH release, npm publish
  - `--dry-run`, `--noai`, `--no-publish`
  - No args → interactive version selector with preview (patch/minor/major)
- `machete pr` — AI-powered pull request creation via Claude + `gh pr create`
  - `--draft`, `--dry-run`, `--base <branch>`, `--noai`, `--title <text>`, `--body <text>`
  - Auto-detects base branch: `--base` flag → `prBaseBranch` config → remote default → prompt
- `machete prune` — Safe branch cleanup: squash-merge detection, 3-phase commit reachability
  - `--dry-run`, `--remote <name>`, `-i`/`--interactive`, `-n`/`--no-interaction`
  - No `--force` — prune is always safe by design

## Desktop App Views

- **Dashboard** — Repo status overview (branch, ahead/behind, clean/dirty)
- **Branches** — List/create/switch/delete branches with remote tracking info
- **Commit Log** — Visual git graph with commit history
- **Commit** — AI-powered commit message generation (mirrors CLI `machete commit`)
- **PR** — AI-powered pull request creation (mirrors CLI `machete pr`)
- **Release** — Release pipeline interface (mirrors CLI `machete release`)
- **Settings** — Per-repo configuration (protected branches, remotes, preferences)

## Configuration (4-file system)

Merge order: defaults → `~/.machete/macheterc` → `~/.machete/credentials` → `<repo>/.macheterc` → `<repo>/.machete.env`

- Config keys: `protectedBranches`, `defaultRemote`, `prBaseBranch`
- Credential keys (auto-routed to secrets files): `anthropicApiKey`, `githubToken`, `bitbucketToken`
- Default protected branches: `main`, `master`, `develop`

## Backlog

Stories and ideas live in `docs/backlog/`. See `docs/backlog/AGENTS.md` for the full workflow. Key rules:

- Ideas in `IDEAS.md`, stories in `stories/`, completed stories in `stories/implemented/`
- Story IDs are sequential: `MACH-0001`, `MACH-0002`, etc.
- When completing a story: update status to `done`, move file to `implemented/`, **remove** from active IDEAS.md section, **add** to Done section
- Commit messages use `[MACH-NNNN]` prefix
