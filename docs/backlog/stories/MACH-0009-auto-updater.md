---
id: MACH-0009
title: Auto-updater — detect and install app updates from GitHub Releases
status: ready
priority: high
created: 2026-03-15
---

# MACH-0009: Auto-updater — detect and install app updates from GitHub Releases

## Motivation

Machete is distributed as a standalone desktop app via GitHub Releases. Currently there is no mechanism for users to know when a new version is available — they must manually check the releases page. This creates a long tail of outdated installations and means bug fixes and new features take weeks to reach users.

Tauri 2 ships a first-party updater plugin (`tauri-plugin-updater`) that handles the full update lifecycle: version checking, download with progress, cryptographic signature verification, and install-with-restart. It uses GitHub Releases as the distribution CDN — no custom update server needed.

## Overview

Add automatic update detection and installation to the Machete desktop app:

1. **Background check** — on app launch and periodically while running, silently check for new versions
2. **Non-intrusive notification** — when an update is found, show a dismissible banner (not a modal)
3. **One-click install** — download with progress, verify signature, restart to apply
4. **Manual check** — "Check for Updates" button in the About dialog
5. **Signed artifacts** — all release builds are cryptographically signed with an Ed25519 keypair

## Architecture

### How Tauri's updater works

```
┌──────────────┐        HTTPS GET         ┌─────────────────────────┐
│  Machete App │  ──────────────────────►  │  GitHub Releases        │
│  (frontend)  │                           │  latest/download/       │
│              │  ◄── latest.json ───────  │    latest.json          │
│              │                           │    Machete_0.6.0_*.dmg  │
│              │  Compare semver           │    Machete_0.6.0_*.sig  │
│              │  v0.5.0 < v0.6.0?         │                         │
│              │                           │                         │
│              │  ── Download artifact ──► │                         │
│              │  ◄── binary + signature   │                         │
│              │                           │                         │
│              │  Verify Ed25519 sig       │                         │
│              │  Install + restart        │                         │
└──────────────┘                           └─────────────────────────┘
```

The plugin checks a JSON endpoint (`latest.json`) hosted alongside each GitHub Release. This file contains:
- The latest version number
- Per-platform download URLs
- Ed25519 signatures for each artifact
- Optional release notes

The plugin compares the version in `latest.json` against the running app's version (from `tauri.conf.json`). If a newer version is available, it can download, verify the signature against the embedded public key, and install.

### Update artifacts by platform

| Platform | Update format | Notes |
|----------|--------------|-------|
| macOS | `.app.tar.gz` | Compressed app bundle (not the `.dmg` installer) |
| Windows | `.nsis` installer | NSIS installer runs silently for updates |
| Linux | `.AppImage` | Self-contained, replaces in place |

The `.dmg`, `.msi`, and `.deb` are for first-time installation only. Updates use lighter-weight formats that Tauri can apply without user interaction.

### Signing

Tauri uses its own Ed25519 signature scheme (separate from macOS code signing or Windows Authenticode). A keypair is generated once and the public key is embedded in the app binary. The private key is stored as a GitHub Actions secret and used at build time to sign artifacts.

```
┌─────────────────────────┐
│  One-time setup         │
│                         │
│  tauri signer generate  │
│  ├─ Public key  ──────► tauri.conf.json (committed)
│  └─ Private key ──────► GitHub Actions secret
└─────────────────────────┘
```

## Implementation

### Step 1: Generate signing keypair

Run once locally:

```bash
npx tauri signer generate -w ~/.tauri/machete.key
```

This produces:
- **Public key** — a base64 string, goes into `tauri.conf.json`
- **Private key** — a file at `~/.tauri/machete.key`, goes into GitHub Actions secrets
- **Password** — optional passphrase for the private key, goes into GitHub Actions secrets

Store in GitHub repo settings → Secrets:
- `TAURI_SIGNING_PRIVATE_KEY` — contents of the key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — passphrase (empty string if none)

### Step 2: Rust dependencies

**`app/src-tauri/Cargo.toml`** — add:

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

`tauri-plugin-process` is needed for `process.relaunch()` after update installation.

### Step 3: Frontend dependencies

**`app/package.json`** — add:

```bash
cd app && npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

### Step 4: Tauri configuration

**`app/src-tauri/tauri.conf.json`** — add to `bundle` and `plugins`:

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "<PUBLIC_KEY_FROM_STEP_1>",
      "endpoints": [
        "https://github.com/frontier-collective/machete/releases/latest/download/latest.json"
      ]
    }
  }
}
```

The `"v2Compatible"` value for `createUpdaterArtifacts` tells the Tauri build to generate:
- Platform-specific update bundles (`.app.tar.gz` on macOS, etc.)
- `.sig` signature files for each update bundle
- A `latest.json` manifest with version, URLs, signatures, and release notes

### Step 5: Capability permissions

**`app/src-tauri/capabilities/default.json`** — add to the `permissions` array:

```json
"updater:default",
"process:default"
```

### Step 6: Rust plugin registration

**`app/src-tauri/src/lib.rs`** — register both plugins in the Tauri builder:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
.plugin(tauri_plugin_process::init())
```

### Step 7: Release workflow changes

**`.github/workflows/release.yml`** — add signing environment variables to the build step:

```yaml
- name: Build Tauri app
  uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  with:
    projectPath: app
    tauriScript: npm run tauri
    args: --target ${{ matrix.target }} --bundles ${{ matrix.bundles }}
```

When `TAURI_SIGNING_PRIVATE_KEY` is set, `tauri-action` automatically:
1. Generates `.sig` files for each update artifact
2. Creates a `latest.json` manifest
3. Uploads both to the GitHub Release

The `latest.json` file is generated per-platform by each matrix job. The `tauri-action` handles merging them when used with `tagName` and `releaseName` options. To ensure proper `latest.json` generation, update the action configuration:

```yaml
- name: Build Tauri app
  uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  with:
    projectPath: app
    tauriScript: npm run tauri
    args: --target ${{ matrix.target }} --bundles ${{ matrix.bundles }}
    tagName: ${{ env.TAG }}
    releaseName: "Machete ${{ env.TAG }}"
    releaseBody: ""
    releaseDraft: false
    prerelease: false
```

This tells `tauri-action` to manage the GitHub Release directly (creating it if needed, or updating it), and to upload `latest.json` as a release asset. Each matrix job appends its platform's entry to the same `latest.json`.

**Update artifact matrix** — add updater-specific bundle formats. The existing bundles (dmg, deb, nsis, msi) are for first-time install. The updater needs different formats:

| Platform | Existing bundles | Add for updater |
|----------|-----------------|-----------------|
| macOS (both archs) | `dmg` | `updater` (produces `.app.tar.gz` + `.sig`) |
| Linux x64 | `deb,appimage` | `updater` (produces `.AppImage.tar.gz` + `.sig`) |
| Linux ARM | `deb` | `updater` |
| Windows x64 | `nsis,msi` | (NSIS already supports updater, just needs signing) |
| Windows ARM | `nsis` | (same) |

Update the `args` to include updater bundles:

```yaml
# macOS
args: --target ${{ matrix.target }} --bundles dmg,updater

# Linux x64
args: --target ${{ matrix.target }} --bundles deb,appimage,updater

# Windows (NSIS handles updates natively)
args: --target ${{ matrix.target }} --bundles nsis,msi
```

### Step 8: Frontend — update hook

Create **`app/src/hooks/useUpdater.ts`**:

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateState {
  /** Available update, or null if up to date */
  available: Update | null;
  /** Version string of the available update */
  version: string | null;
  /** Release notes / changelog body (markdown) */
  notes: string | null;
  /** Whether we're currently checking for updates */
  checking: boolean;
  /** Whether an update is currently downloading */
  downloading: boolean;
  /** Download progress 0–100, or null if not downloading */
  progress: number | null;
  /** Whether the update has been downloaded and is ready to install */
  readyToInstall: boolean;
  /** Error message from the last check/download attempt */
  error: string | null;
  /** Whether the user dismissed the update notification */
  dismissed: boolean;
  /** Manually trigger an update check */
  checkForUpdate: () => Promise<void>;
  /** Download and install the available update */
  downloadAndInstall: () => Promise<void>;
  /** Dismiss the update notification (hides until next version or app restart) */
  dismiss: () => void;
}

const CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes

export function useUpdater(): UpdateState {
  const [available, setAvailable] = useState<Update | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [readyToInstall, setReadyToInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Track which version was dismissed so we don't re-show it
  const dismissedVersion = useRef<string | null>(null);

  const checkForUpdate = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const update = await check();
      if (update) {
        setAvailable(update);
        setVersion(update.version);
        setNotes(update.body ?? null);
        // Only show if this version wasn't already dismissed
        if (dismissedVersion.current === update.version) {
          setDismissed(true);
        } else {
          setDismissed(false);
        }
      } else {
        setAvailable(null);
        setVersion(null);
        setNotes(null);
      }
    } catch (e) {
      // Silently ignore check failures (offline, DNS issues, etc.)
      // Only surface errors for manual checks
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!available) return;
    setDownloading(true);
    setProgress(0);
    setError(null);
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;
      await available.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            totalBytes = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            if (totalBytes > 0) {
              setProgress(Math.round((downloadedBytes / totalBytes) * 100));
            }
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });
      setReadyToInstall(true);
      // Auto-relaunch after a short delay so the user sees the "ready" state
      setTimeout(() => {
        relaunch();
      }, 1500);
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(false);
    }
  }, [available]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (version) {
      dismissedVersion.current = version;
    }
  }, [version]);

  // Check on mount (with a short delay to not block startup)
  useEffect(() => {
    const timer = setTimeout(checkForUpdate, 5000);
    return () => clearTimeout(timer);
  }, [checkForUpdate]);

  // Periodic check every 30 minutes
  useEffect(() => {
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkForUpdate]);

  // Check on window re-focus (piggyback on visibility change)
  useEffect(() => {
    let lastCheck = Date.now();
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // Only re-check if it's been at least 30 minutes since last check
      if (Date.now() - lastCheck < CHECK_INTERVAL) return;
      lastCheck = Date.now();
      checkForUpdate();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [checkForUpdate]);

  return {
    available,
    version,
    notes,
    checking,
    downloading,
    progress,
    readyToInstall,
    error,
    dismissed,
    checkForUpdate,
    downloadAndInstall,
    dismiss,
  };
}
```

### Step 9: Frontend — update banner component

Create **`app/src/components/layout/UpdateBanner.tsx`**:

A thin, non-intrusive banner that appears at the top of the app window (above the tab bar) when an update is available.

```typescript
import { Loader2, Download, X, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UpdateState } from "@/hooks/useUpdater";

interface UpdateBannerProps {
  update: UpdateState;
}

export function UpdateBanner({ update }: UpdateBannerProps) {
  // Don't show if: no update, dismissed, or still checking on startup
  if (!update.available || update.dismissed) return null;

  // Ready to install — app is about to restart
  if (update.readyToInstall) {
    return (
      <div className="flex items-center gap-2 bg-green-500/15 border-b border-green-500/30 px-4 py-2 text-xs shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        <span className="text-green-700 dark:text-green-400 font-medium">
          Update installed — restarting...
        </span>
      </div>
    );
  }

  // Downloading
  if (update.downloading) {
    return (
      <div className="flex items-center gap-2 bg-brand/10 border-b border-brand/20 px-4 py-2 text-xs shrink-0">
        <Loader2 className="h-3.5 w-3.5 text-brand animate-spin shrink-0" />
        <span className="text-foreground font-medium">
          Downloading update v{update.version}...
        </span>
        {update.progress !== null && (
          <div className="flex-1 max-w-[200px] h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-300"
              style={{ width: `${update.progress}%` }}
            />
          </div>
        )}
        <span className="text-muted-foreground">{update.progress}%</span>
      </div>
    );
  }

  // Error during download
  if (update.error) {
    return (
      <div className="flex items-center gap-2 bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-xs shrink-0">
        <span className="text-destructive flex-1">
          Update failed: {update.error}
        </span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={update.downloadAndInstall}>
          <RefreshCw className="mr-1.5 h-3 w-3" />
          Retry
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={update.dismiss}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Update available — prompt to download
  return (
    <div className="flex items-center gap-2 bg-brand/10 border-b border-brand/20 px-4 py-2 text-xs shrink-0">
      <span className="text-foreground">
        <span className="font-medium">Machete v{update.version}</span> is available
      </span>
      <Button variant="brand" size="sm" className="h-6 px-2 text-xs" onClick={update.downloadAndInstall}>
        <Download className="mr-1.5 h-3 w-3" />
        Update
      </Button>
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto" onClick={update.dismiss}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
```

### Step 10: Frontend — integrate into App.tsx

Wire the hook and banner into the main app layout:

```typescript
// In App.tsx
import { useUpdater } from "@/hooks/useUpdater";
import { UpdateBanner } from "@/components/layout/UpdateBanner";

function App() {
  const update = useUpdater();
  // ... existing state ...

  // Pass update state to About dialog for "Check for Updates" button
  // ...

  return (
    <>
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        {/* Update banner — above tab bar */}
        <UpdateBanner update={update} />

        {/* Tab bar */}
        <TabBar tabManager={tabManager} onAbout={() => setAboutOpen(true)} />

        {/* ... rest of layout ... */}
      </div>

      <AboutDialog
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        health={health}
        healthLoading={healthLoading}
        update={update}
      />
    </>
  );
}
```

### Step 11: About dialog — "Check for Updates" button

Add an update section to the existing `AboutDialog` component:

```typescript
// Inside AboutDialog, after the health checks section:
<div className="w-full flex flex-col gap-2 items-center mt-2">
  {update.available && !update.readyToInstall ? (
    <div className="text-center space-y-2">
      <p className="text-sm font-medium">
        v{update.version} is available
      </p>
      <Button size="sm" variant="brand" onClick={update.downloadAndInstall} disabled={update.downloading}>
        {update.downloading ? (
          <>
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Downloading... {update.progress}%
          </>
        ) : (
          <>
            <Download className="mr-2 h-3.5 w-3.5" />
            Download &amp; Install
          </>
        )}
      </Button>
    </div>
  ) : update.readyToInstall ? (
    <p className="text-sm text-green-600 dark:text-green-400 font-medium">
      ✓ Update installed — restarting...
    </p>
  ) : (
    <Button
      variant="outline"
      size="sm"
      onClick={update.checkForUpdate}
      disabled={update.checking}
    >
      {update.checking ? (
        <>
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          Checking...
        </>
      ) : (
        "Check for Updates"
      )}
    </Button>
  )}
  {update.error && (
    <p className="text-xs text-destructive">{update.error}</p>
  )}
</div>
```

## UX Behaviour

### Update check timing

| Trigger | Delay | Notes |
|---------|-------|-------|
| App launch | 5 seconds | Don't block startup |
| Periodic | Every 30 minutes | Silent background check |
| Window re-focus | If >30 min since last check | Piggybacks on visibility change |
| Manual (About dialog) | Immediate | User-initiated, shows spinner |

### Notification behaviour

- **First appearance**: non-modal banner at the top of the window, above the tab bar
- **Dismiss**: hides the banner for that version until the app is restarted or a newer version is detected
- **No forced updates**: the user can always dismiss and continue using the current version
- **No update nag**: dismissed updates don't re-appear until the app is restarted

### Download and install flow

1. User clicks **Update** (banner or About dialog)
2. Banner shows progress bar with percentage
3. Download completes → signature verified automatically by Tauri
4. Banner shows "Update installed — restarting..."
5. App relaunches after 1.5 second delay
6. User is now running the new version

### Error handling

| Error | Behaviour |
|-------|-----------|
| Network unreachable | Silent (background check), show error (manual check) |
| `latest.json` missing | Silent — treated as "no update available" |
| Signature verification failed | Show error: "Update signature verification failed. The update may be corrupted." |
| Download interrupted | Show error with Retry button |
| Install failed | Show error, suggest manual download from GitHub Releases |

### Dev mode

The updater should be disabled during development (`npm run tauri dev`). The `check()` call will naturally fail since there's no `latest.json` endpoint configured for dev builds, and errors during background checks are silently ignored. No special dev-mode gating is needed.

## `latest.json` format

Generated automatically by `tauri-action` when signing keys are present:

```json
{
  "version": "0.6.0",
  "notes": "## What's New\n\n- Feature A\n- Bug fix B",
  "pub_date": "2026-03-15T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://github.com/frontier-collective/machete/releases/download/v0.6.0/Machete.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://github.com/frontier-collective/machete/releases/download/v0.6.0/Machete.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://github.com/frontier-collective/machete/releases/download/v0.6.0/Machete_0.6.0_amd64.AppImage.tar.gz"
    },
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://github.com/frontier-collective/machete/releases/download/v0.6.0/Machete_0.6.0_x64-setup.nsis.zip"
    }
  }
}
```

## Files to create

| File | Purpose |
|------|---------|
| `app/src/hooks/useUpdater.ts` | React hook: check, download, install, state management |
| `app/src/components/layout/UpdateBanner.tsx` | Non-intrusive update notification banner |

## Files to modify

| File | Changes |
|------|---------|
| `app/src-tauri/Cargo.toml` | Add `tauri-plugin-updater` and `tauri-plugin-process` |
| `app/src-tauri/src/lib.rs` | Register updater and process plugins |
| `app/src-tauri/tauri.conf.json` | Add `createUpdaterArtifacts`, updater plugin config with pubkey + endpoint |
| `app/src-tauri/capabilities/default.json` | Add `updater:default` and `process:default` permissions |
| `app/src/App.tsx` | Wire `useUpdater` hook, render `UpdateBanner`, pass state to `AboutDialog` |
| `.github/workflows/release.yml` | Add signing env vars, updater bundle types, let `tauri-action` manage release + `latest.json` |

## One-time setup (not in code)

| Task | Details |
|------|---------|
| Generate signing keypair | `npx tauri signer generate -w ~/.tauri/machete.key` |
| Add GitHub secret | `TAURI_SIGNING_PRIVATE_KEY` — contents of key file |
| Add GitHub secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — passphrase (or empty) |

## Verification

### Manual testing

1. Build a release with signing keys → verify `.sig` files and `latest.json` are generated
2. Install the built version → verify update check runs 5 seconds after launch
3. Push a new tagged release → verify the installed app detects the update
4. Click Update → verify download progress, signature verification, restart
5. Verify the About dialog shows "Check for Updates" button
6. Verify dismissing the banner hides it until restart
7. Verify offline behaviour — no error shown for background checks

### CI verification

- `npx tsc --noEmit` in `app/` — TypeScript compiles
- `cargo check` in `app/src-tauri/` — Rust compiles with new plugin dependencies
- Release workflow produces `latest.json` alongside artifacts

### Edge cases to test

- App is offline during update check → silent failure
- App goes offline mid-download → error with retry button
- User dismisses update, reopens About dialog → "Check for Updates" still works
- Multiple app windows open → only one banner shown (single App instance)
- Dev mode (`tauri dev`) → updater check silently fails, no banner shown
