# Machete

Git toolset CLI — `@frontier-collective/machete`

## Quick Reference

- **Build:** `npm run build` (just `tsc`)
- **Dev:** `npm run dev` (tsc --watch)
- **Test:** `npm test` (node --test)
- **Run locally:** `node dist/index.js <command>`

## Key Decisions

- Node 22+ required (use modern APIs freely)
- ES modules throughout — always use `.js` extensions in imports
- No linters/formatters/bundlers — just TypeScript
- Manual CLI arg parsing — no third-party CLI frameworks
- Follow Whetstone patterns (see `~/Development/whetstone/`)
- ANSI colors directly — no chalk/kleur
- Tests use Node native test runner, co-located as `*.test.ts`

## Commands

- `machete init` — Initialize `.macheterc` in the current repo (detects remotes)
- `machete config` — Read/write config values; credentials auto-route to secrets files
- `machete commit` — AI-powered commit messages via Claude (Conventional Commits format)
  - `--dry-run`
- `machete release` — Full git-flow release: version bump, changelog, branch/tag management, GH release, npm publish
  - `--dry-run`, `--noai`, `--no-publish`
  - No args → interactive version selector with preview (patch/minor/major)
- `machete prune` — Safe branch cleanup: squash-merge detection, 3-phase commit reachability
  - `--dry-run`, `--remote <name>`, `-i`/`--interactive`, `-n`/`--no-interaction`
  - No `--force` — prune is always safe by design

## Configuration (4-file system)

Merge order: defaults → `~/.machete/macheterc` → `~/.machete/credentials` → `<repo>/.macheterc` → `<repo>/.machete.env`

- Config keys: `protectedBranches`, `defaultRemote`
- Credential keys (auto-routed to secrets files): `anthropicApiKey`, `githubToken`, `bitbucketToken`
- Default protected branches: `main`, `master`, `develop`

## Backlog

Stories and ideas live in `docs/backlog/`. See `docs/backlog/AGENTS.md` for the full workflow. Key rules:

- Ideas in `IDEAS.md`, stories in `stories/`, completed stories in `stories/implemented/`
- Story IDs are sequential: `MACH-0001`, `MACH-0002`, etc.
- When completing a story: update status to `done`, move file to `implemented/`, **remove** from active IDEAS.md section, **add** to Done section
- Commit messages use `[MACH-NNNN]` prefix
