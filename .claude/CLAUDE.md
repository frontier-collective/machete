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
- `machete prune` — Delete local branches with no remote equivalent
  - `--dry-run`, `--force`, `--remote <name>`, `-i`/`--interactive`

## Configuration (4-file system)

Merge order: defaults → `~/.machete/macheterc` → `~/.machete/credentials` → `<repo>/.macheterc` → `<repo>/.machete.env`

- Config keys: `protectedBranches`, `defaultRemote`
- Credential keys (auto-routed to secrets files): `anthropicApiKey`, `githubToken`, `bitbucketToken`
- Default protected branches: `main`, `master`, `develop`
