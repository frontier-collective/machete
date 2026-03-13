# Machete

A machete clears the path. It doesn't fell the tree or till the soil — it cuts through the undergrowth so you can move. Dead branches, tangled vines, overgrown trails. One swing and they're gone.

Machete does the same for your git repositories. Stale branches, messy commit messages, manual release chores — all undergrowth. Machete cuts through it with AI-powered commits, automated git-flow releases, and branch cleanup that just works.

Part of the [Frontier Collective](https://www.npmjs.com/org/frontier-collective) toolkit.

## Authors

- **Derek Clapham** — derek.clapham@gmail.com

## Install

Requires Node.js 22 or later.

### Option A: npm (once published)

```bash
npm install -g @frontier-collective/machete
```

To uninstall:

```bash
npm uninstall -g @frontier-collective/machete
rm -rf ~/.machete  # optional: remove global config directory
```

### Option B: From source

```bash
git clone https://github.com/frontier-collective/machete.git
cd machete
npm install
npm run build
npm link
```

This symlinks the `machete` command into your global bin so you can run it from any directory.

To uninstall:

```bash
npm rm -g @frontier-collective/machete
rm -rf ~/.machete  # optional: remove global config directory
```

## Commands

### `machete init`

Initialize a `.macheterc` config file in the current repository.

```bash
machete init
```

This will:
- Detect your git remote(s) and set the default automatically
- Prompt you to choose if multiple remotes are configured
- Offer to add `.macheterc` and `.machete.env` to your `.gitignore`

### `machete config`

Read and write configuration values.

```bash
# Read a value
machete config defaultRemote

# Set a value (local)
machete config defaultRemote upstream

# Set a value (global)
machete config -g defaultRemote upstream

# Add/remove from arrays
machete config protectedBranches --add release
machete config protectedBranches --remove release

# Set a credential (auto-routed to .machete.env or ~/.machete/credentials)
machete config anthropicApiKey sk-ant-...
machete config -g anthropicApiKey sk-ant-...

# Show all config with sources
machete config --list
```

### `machete commit`

Generate an AI-powered commit message and commit staged changes. Requires an Anthropic API key.

```bash
# Stage, generate message, and commit
machete commit

# Preview the generated message without committing
machete commit --dry-run
```

**What it does:**

1. Checks for staged and unstaged files
2. If unstaged files exist, offers to stage them
3. Sends the staged diff to Claude to generate a Conventional Commits message
4. Displays the message and commits

### `machete pr`

Create a GitHub pull request with an AI-generated title and description. Gathers branch context — commits, diff stats, branch name — and sends it to Claude to produce a structured PR. Requires the GitHub CLI (`gh`) and an Anthropic API key.

```bash
# Generate PR with AI title and description
machete pr

# Create as draft PR
machete pr --draft

# Preview without creating
machete pr --dry-run

# Override the base branch
machete pr --base main

# Skip AI, enter title/body manually
machete pr --noai

# Override just the title or body
machete pr --title "Fix login redirect"
machete pr --body "Quick fix for the redirect loop"
```

**What it does:**

1. Detects the base branch (`--base` flag → `prBaseBranch` config → remote default → prompt)
2. Checks if the branch is pushed to the remote; prompts to push if not
3. Gathers commits, diff stats, and changed files since the base branch
4. Sends context to Claude to generate a title and structured body (Summary, Changes, Test plan)
5. Previews the result and offers to edit in `$EDITOR` before creating
6. Creates the PR via `gh pr create`

### `machete release`

Full git-flow release pipeline: version bump, AI-generated changelog, branch management, GitHub release, and npm publish.

```bash
# Interactive — choose patch/minor/major with version previews
machete release

# Explicit bump type
machete release minor

# Preview without making changes
machete release patch --dry-run

# Skip AI changelog (use raw git log)
machete release minor --noai

# Stop after push (skip GH release + npm)
machete release major --no-publish
```

**What it does:**

1. Validates you're on `develop` with a clean tree
2. Runs build and tests
3. Bumps version (`patch`, `minor`, or `major` — interactive selector if no arg given)
4. Generates changelog with Claude (or raw git log with `--noai`)
5. Creates a `release/X.Y.Z` branch, commits, merges to `master`, tags, merges back to `develop`
6. Prompts to push, create a GitHub release (requires `gh` CLI), and publish to npm

### `machete prune`

Over time, local branches pile up — feature branches that were merged via PR, hotfixes that were squash-merged, experiments that went nowhere. Git doesn't clean these up automatically, and manually checking which branches are safe to delete is tedious and error-prone. Delete the wrong one and you lose work.

Machete prune solves this by classifying every local branch before touching anything. It uses a 3-phase safety check — hash-identity, patch-id comparison via `git cherry`, and combined-diff patch-id matching — to detect not just regular merges but also squash merges (where GitHub combines multiple commits into one). Only branches whose work is verified to exist on remote **and** on another local branch are ever deleted. There is no `--force` flag. Prune is always safe.

```bash
# Preview what would happen — nothing is deleted
machete prune --dry-run

# Delete safe branches (with confirmation prompt)
machete prune

# Choose which safe branches to delete interactively
machete prune -i

# Skip confirmation prompt (for scripting)
machete prune -n

# Compare against a different remote
machete prune --remote upstream
```

**What it does:**

1. Fetches the latest refs from the remote (with `--prune`)
2. Categorizes every local branch: current, on remote, protected, or stale
3. For each stale branch, runs 3-phase safety classification:
   - **Phase 1:** Hash-identity — are all commits reachable from a remote ref and another local branch?
   - **Phase 2:** Patch-equivalence (remote) — does `git cherry` or combined-diff patch-id match a remote protected branch? Catches squash merges.
   - **Phase 3:** Patch-equivalence (local) — same check against local branches not also being pruned
4. Displays a full summary showing every branch and why it's safe, unsafe, or protected
5. Only deletes branches classified as safe — unsafe branches are shown but never touched

## Configuration

Run `machete init` to create a `.macheterc` in your repo root, or create one manually:

```json
{
  "protectedBranches": ["main", "master", "develop"],
  "defaultRemote": "origin",
  "prBaseBranch": "develop"
}
```

| File | Scope | Purpose |
|------|-------|---------|
| `<repo>/.macheterc` | Local | Project config |
| `<repo>/.machete.env` | Local | Project secrets (API keys, tokens) |
| `~/.machete/macheterc` | Global | Global config |
| `~/.machete/credentials` | Global | Global secrets |

The `~/.machete/` directory is created automatically on install.

Configuration is merged in order: **defaults → global config → global credentials → local config → local secrets**

Credential keys (`anthropicApiKey`, `githubToken`, `bitbucketToken`) are automatically routed to the appropriate secrets file.

## Contributors

Contributions welcome! See the git log for a full list of contributors.

## License

MIT
