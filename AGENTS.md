# Machete — Agent Guidelines

## Project Overview

Machete is a CLI git toolset published as `@frontier-collective/machete` on npm. It provides a growing collection of commands for managing git repositories — pruning stale branches, and more over time. It is designed to be installed globally (`npm install -g`) and invoked as `machete <command>`.

## Architecture

- **Language:** TypeScript (strict mode, ES2022 target, Node16 module resolution)
- **Module system:** Native ES modules (`"type": "module"`, `.js` extensions in all imports)
- **Runtime:** Node.js 22+
- **Testing:** Node native test runner (`node --test`)
- **Build:** `tsc` only — no bundlers, no build tools beyond TypeScript
- **CLI parsing:** Manual argument parsing — no commander, yargs, or similar libraries
- **Config:** `.macheterc` (JSON) for per-repo or global configuration

## Directory Structure

```
src/
├── index.ts              # Entry point, CLI dispatch, shebang
├── commands/             # One file per subcommand
│   ├── config.ts         # Read/write config and credentials
│   ├── init.ts           # Initialize .macheterc in repo root
│   └── prune.ts          # Delete local branches without remote equivalents
├── cli/
│   ├── args.ts           # Manual argument parser (--flag value, --flag=value, booleans)
│   ├── help.ts           # Help text with ANSI color output
│   ├── format.ts         # Shared output formatting functions
│   └── prompt.ts         # Interactive stdin prompts
├── lib/
│   ├── types.ts          # Shared TypeScript interfaces and types
│   ├── git.ts            # Git operations (exec wrappers, branch listing, remote queries)
│   ├── config.ts         # 4-file config loading and merging, read/write helpers
│   ├── gitignore.ts      # Shared .gitignore prompt helper
│   └── version.ts        # Read version from package.json at runtime
```

## Code Conventions

Follow the patterns established by the sister project, Whetstone (`@frontier-collective/whetstone-mcp`):

### Naming
- **Files:** kebab-case (`get-branches.ts`)
- **Functions:** camelCase (`getBranches`)
- **Interfaces:** PascalCase with descriptive suffixes (`PruneOptions`, `BranchInfo`)
- **Constants:** SCREAMING_SNAKE_CASE (`DEFAULT_PROTECTED_BRANCHES`)

### Patterns
- Use **dynamic imports** for command modules to keep startup fast
- Use **prepared/structured return types** — commands return typed result objects, formatting is separate
- Use **ANSI escape codes** directly for terminal colors (no chalk/kleur)
- Keep functions **pure where possible** — side effects (git commands, I/O) are isolated in `lib/git.ts` and `cli/prompt.ts`
- **No classes** unless genuinely needed — prefer plain functions and interfaces
- **Error handling:** Throw descriptive errors for validation failures; `process.exit(1)` in CLI layer on unrecoverable errors

### Style
- No ESLint or Prettier — keep formatting consistent by hand
- Use `const` by default, `let` only when mutation is required
- Prefer explicit return types on exported functions
- Use template literals for string building

## Commands

### `machete init`

Creates a `.macheterc` config file in the current git repo root.

**Behavior:**
1. Check if inside a git repo (error if not)
2. Check if `.macheterc` already exists (warn + abort if so)
3. Detect git remotes — auto-set `defaultRemote` (prompt if multiple)
4. Write config JSON to `<repo-root>/.macheterc`
5. Prompt to add `.macheterc` and `.machete.env` to `.gitignore`

### `machete config`

Read and write configuration values. Credential keys are auto-routed to secrets files.

**Usage:**
- `machete config <key>` — Read merged value
- `machete config <key> <value>` — Write to local config/secrets
- `machete config -g <key> <value>` — Write to global config/secrets
- `machete config <key> --add <value>` — Append to array
- `machete config <key> --remove <value>` — Remove from array
- `machete config --list` — Show all values with sources

**Credential keys** (auto-routed to secrets files): `anthropicApiKey`, `githubToken`, `bitbucketToken`

### `machete prune`

Deletes local branches that have no remote tracking equivalent.

**Flags:**
- `--dry-run` — Show what would be deleted without deleting
- `--force` — Skip confirmation prompt
- `--remote <name>` — Remote to compare against (default: `origin`)
- `--interactive` / `-i` — Select branches to delete interactively

**Behavior:**
1. Fetch remote refs (`git fetch --prune`)
2. List local branches
3. List remote branches
4. Compute difference (local branches with no remote equivalent)
5. Exclude protected branches (from config)
6. Prompt for confirmation (unless `--force` or `--dry-run`)
7. Delete confirmed branches (`git branch -D`)

**Protected branches** (from `.macheterc` or defaults): `main`, `master`, `develop`

## Configuration

Machete uses a 4-file config system. Merge order (last wins):

1. Defaults
2. `~/.machete/macheterc` — global config
3. `~/.machete/credentials` — global secrets
4. `<repo>/.macheterc` — local config
5. `<repo>/.machete.env` — local secrets

The `~/.machete/` directory is created automatically via the npm `postinstall` script.

**Config keys:** `protectedBranches` (string[]), `defaultRemote` (string)
**Credential keys:** `anthropicApiKey`, `githubToken`, `bitbucketToken` — auto-routed to secrets files

## Testing

- Tests live alongside source files as `*.test.ts`
- Run with `node --test dist/**/*.test.ts`
- Test git operations by creating temporary git repos in `/tmp`
- Keep tests focused and fast — no mocking frameworks

## Safety

- **Never delete protected branches**
- **Always confirm before destructive operations** (unless `--force`)
- **`--dry-run` must never perform writes**
- Branch deletion uses `git branch -D` (force delete) because the remote is already gone

## Future Direction

This tool will grow to include additional git management commands (e.g., branch status overview, stale branch reporting, GitHub/Bitbucket integration). All commands should follow the same patterns established here.
