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

  // Track last check time for visibility-based re-check
  const lastCheckTime = useRef(0);

  const checkForUpdate = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const update = await check();
      lastCheckTime.current = Date.now();
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
    } catch {
      // Silently ignore check failures (offline, DNS issues, dev mode, etc.)
      // Error is only surfaced when the user manually checks via About dialog
    } finally {
      setChecking(false);
    }
  }, []);

  // Wrap for manual checks — surfaces errors to the UI
  const manualCheck = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const update = await check();
      lastCheckTime.current = Date.now();
      if (update) {
        setAvailable(update);
        setVersion(update.version);
        setNotes(update.body ?? null);
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

  // Check on window re-focus if it's been 30+ minutes since last check
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheckTime.current < CHECK_INTERVAL) return;
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
    checkForUpdate: manualCheck,
    downloadAndInstall,
    dismiss,
  };
}
