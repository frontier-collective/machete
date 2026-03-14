# Installation

Machete has two components: a **CLI** and a **desktop app** (macOS). They can be installed independently, but the desktop app relies on the CLI for AI-powered features.

## Prerequisites

| Dependency | Required for | Install |
|-----------|-------------|---------|
| Node.js 22+ | CLI | [nodejs.org](https://nodejs.org/) |
| Git | Both | `xcode-select --install` or [git-scm.com](https://git-scm.com/) |
| GitHub CLI (`gh`) | PR creation | `brew install gh` or [cli.github.com](https://cli.github.com/) |
| Anthropic API key | AI features | [console.anthropic.com](https://console.anthropic.com/) |

## CLI

### Option A: npm (recommended)

```bash
npm install -g @frontier-collective/machete
```

### Option B: From source

```bash
git clone https://github.com/frontier-collective/machete.git
cd machete
npm install
npm run build
npm link
```

### Setup

After installing, initialize machete in any git repository:

```bash
cd your-repo
machete init
```

Set your Anthropic API key (required for AI commit messages, PR generation, and changelogs):

```bash
# Per-repo
machete config anthropicApiKey sk-ant-...

# Or globally (shared across all repos)
machete config -g anthropicApiKey sk-ant-...
```

### Verify

```bash
machete --version
machete config --list
```

### Uninstall

```bash
npm uninstall -g @frontier-collective/machete
rm -rf ~/.machete  # optional: remove global config
```

## Desktop App

### Install from DMG

1. Download the `.dmg` from the latest release
2. Drag **Machete.app** into `/Applications`
3. Open Machete and select a git repository folder

### Unsigned app (macOS Gatekeeper)

The DMG is not code-signed, so macOS will block it on first launch. To allow it, either:

- **Option A:** Right-click the app > **Open** > click **Open** in the dialog (one-time only)
- **Option B:** Go to **System Settings > Privacy & Security**, scroll to the Security section, and click **Open Anyway**
- **Option C:** Strip the quarantine attribute before opening:
  ```bash
  xattr -cr /Applications/Machete.app
  ```

### What works without the CLI

The desktop app talks directly to git for core operations. These features work out of the box:

- Repository status, staging, and unstaging files
- Viewing diffs (including binary file detection)
- Committing with a manual message
- Push, pull, and fetch
- Branch management (create, switch, delete)
- Commit log with visual graph
- Stash management
- Tag viewing

### What requires the CLI

These features shell out to the `machete` CLI and will show an error if it's not installed:

- **AI commit message generation** — `machete commit --generate`
- **Pull request creation** — `machete pr`
- **Branch pruning** — `machete prune`
- **Release pipeline** — `machete release`
- **Settings / config management** — `machete config`

To enable these features, install the CLI (see above) and ensure it's on your PATH. The app checks these locations in order:

1. `/opt/homebrew/bin/machete`
2. `/usr/local/bin/machete`
3. `machete` on PATH

### Build from source

Requires [Rust](https://rustup.rs/) and Node.js 22+.

```bash
git clone https://github.com/frontier-collective/machete.git
cd machete

# Install CLI dependencies
npm install
npm run build

# Run the desktop app in dev mode (hot reload)
make app-dev

# Or build the .app bundle
make app-build

# Or build a .dmg installer
make app-dmg
```

Run `make help` for all build targets.

### Releasing

The desktop app is built and attached to GitHub releases in two ways:

#### Automatic (CI)

When `machete release` pushes a version tag (e.g. `v0.3.0`), a GitHub Actions workflow automatically builds the desktop app for all supported platforms and attaches the installers to the release:

| Platform | Architecture | Installer |
|----------|-------------|-----------|
| macOS | Apple Silicon (arm64) | `.dmg` |
| macOS | Intel (x64) | `.dmg` |
| Linux | x64 | `.deb`, `.AppImage` |
| Linux | ARM (arm64) | `.deb`, `.AppImage` |
| Windows | x64 | `.exe` (NSIS), `.msi` |
| Windows | ARM (arm64) | `.exe` (NSIS) |

The workflow can also be triggered manually from the GitHub Actions tab.

#### Local (from machete release)

The `machete release` command also offers to build and attach a DMG locally. After creating the GitHub release, it prompts:

> *Build and attach desktop app DMG to vX.Y.Z?*

If confirmed, it runs `make app-dmg` and uploads via `gh release upload`. This requires Rust and the Tauri build toolchain on the local machine.

If the build fails, the release continues — it prints the manual command:

```bash
make app-dmg
gh release upload vX.Y.Z app/src-tauri/target/release/bundle/dmg/*.dmg
```

## Configuration

Machete uses a 4-file configuration system, merged in order:

| File | Scope | Purpose |
|------|-------|---------|
| `~/.machete/macheterc` | Global | User preferences |
| `~/.machete/credentials` | Global | API keys and tokens |
| `<repo>/.macheterc` | Local | Project config |
| `<repo>/.machete.env` | Local | Project secrets |

Credential keys (`anthropicApiKey`, `githubToken`, `bitbucketToken`) are automatically routed to the appropriate secrets file when set via `machete config`.

### Config keys

| Key | Type | Description |
|-----|------|-------------|
| `protectedBranches` | `string[]` | Branches that should never be pruned (default: `main`, `master`, `develop`) |
| `defaultRemote` | `string` | Remote to use for operations (default: `origin`) |
| `prBaseBranch` | `string` | Default base branch for pull requests |
| `anthropicApiKey` | `string` | Anthropic API key for AI features (credential) |
| `githubToken` | `string` | GitHub personal access token (credential) |
| `bitbucketToken` | `string` | Bitbucket app password (credential) |
