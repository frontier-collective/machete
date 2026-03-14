import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { RepoSidebar } from "@/components/layout/RepoSidebar";
import { Toolbar, type ToolbarAction } from "@/components/layout/Toolbar";
import { SlideOver } from "@/components/layout/SlideOver";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { CommitLog } from "@/components/log/CommitLog";
import { CommitView } from "@/components/commit/CommitView";
import { BranchesView } from "@/components/branches/BranchesView";
import { PrView } from "@/components/pr/PrView";
import { ReleaseView } from "@/components/release/ReleaseView";
import { SettingsView } from "@/components/settings/SettingsView";
import { useDrag } from "@/hooks/useDrag";
import { useKeyboardShortcuts, type ShortcutDef } from "@/hooks/useKeyboardShortcuts";
import {
  RepoContext,
  RepoPathContext,
  StatusContext,
  SelectionContext,
  LayoutContext,
  ClassificationContext,
  RepoMetadataContext,
  PullRequestsContext,
} from "@/hooks/useRepo";
import { useRepoLayout } from "@/hooks/useRepoLayout";
import type { RepoStatus, PruneClassification, ConfigEntry, GithubPr } from "@/types";
import type { TabStatusInfo } from "@/hooks/useTabManager";
import { X } from "lucide-react";

interface RepoTabContentProps {
  tabId: string;
  repoPath: string;
  isActive: boolean;
  onStatusReport?: (tabId: string, status: TabStatusInfo) => void;
}

export function RepoTabContent({ tabId, repoPath, isActive, onStatusReport }: RepoTabContentProps) {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const lastStatusJson = useRef<string>("");
  const hasLoaded = useRef(false);
  const refreshInFlight = useRef(false);
  const refreshGeneration = useRef(0);

  // Branch classification (shared between sidebar + BranchesView)
  // Restore from localStorage so the UI starts with the last known state
  const [classification, setClassification] = useState<PruneClassification | null>(() => {
    try {
      const raw = localStorage.getItem(`machete:classification:${repoPath}`);
      return raw ? (JSON.parse(raw) as PruneClassification) : null;
    } catch {
      return null;
    }
  });
  const [classificationLoading, setClassificationLoading] = useState(false);

  const fetchClassification = useCallback(async () => {
    if (!repoPath || classificationLoading) return;
    setClassificationLoading(true);
    try {
      const result = await invoke<PruneClassification>("get_branch_classification", { repoPath });
      setClassification(result);
      try {
        localStorage.setItem(`machete:classification:${repoPath}`, JSON.stringify(result));
      } catch { /* Storage full */ }
    } catch {
      // Non-critical
    } finally {
      setClassificationLoading(false);
    }
  }, [repoPath, classificationLoading]);

  // Repo metadata: default branch + protected branches (loaded once per repo)
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [protectedBranches, setProtectedBranches] = useState<string[]>(["main", "master", "develop"]);

  // Pull requests — map from branch name → open/draft PR
  const [prByBranch, setPrByBranch] = useState<Map<string, GithubPr>>(new Map());

  // Toolbar slide-over state
  const [activeAction, setActiveAction] = useState<ToolbarAction>(null);

  // Global alert banner (e.g. checkout errors)
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Selected branch (from sidebar click → highlights in commit log)
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  // Selected commit (from commit log click → shows detail in bottom panel)
  // null = show uncommitted changes (staging area)
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);

  // Per-repo layout persistence
  const { layout, updateLayout } = useRepoLayout(repoPath);

  // Resizable: sidebar width (pixels)
  const onSidebarDrag = useCallback((delta: number) => {
    updateLayout({ sidebarWidth: Math.min(400, Math.max(140, layout.sidebarWidth + delta)) });
  }, [layout.sidebarWidth, updateLayout]);
  const sidebarDragHandle = useDrag(onSidebarDrag, "horizontal");

  // Resizable: log panel height (percentage of main area)
  const mainAreaRef = useRef<HTMLDivElement>(null);

  const onLogDrag = useCallback((delta: number) => {
    const area = mainAreaRef.current;
    if (!area) return;
    const h = area.getBoundingClientRect().height;
    if (h <= 0) return;
    const pctDelta = (delta / h) * 100;
    updateLayout({ logPanelPct: Math.min(70, Math.max(15, layout.logPanelPct + pctDelta)) });
  }, [layout.logPanelPct, updateLayout]);
  const logDragHandle = useDrag(onLogDrag, "vertical");

  // ── Keyboard shortcuts for slide-overs ────────────────────────────
  const toggleAction = useCallback((action: ToolbarAction) => {
    setActiveAction((prev) => (prev === action ? null : action));
  }, []);

  const shortcuts = useMemo<ShortcutDef[]>(
    () => isActive ? [
      { key: ",", meta: true, handler: () => toggleAction("settings") },
      { key: "p", meta: true, shift: true, handler: () => toggleAction("pr") },
      { key: "b", meta: true, shift: true, handler: () => toggleAction("prune") },
      { key: "e", meta: true, shift: true, handler: () => toggleAction("release") },
    ] : [],
    [toggleAction, isActive]
  );
  useKeyboardShortcuts(shortcuts);

  // ── Status refresh ────────────────────────────────────────────────
  const refreshStatus = useCallback(async () => {
    if (!repoPath) return;
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    const gen = ++refreshGeneration.current;
    if (!hasLoaded.current) setStatusLoading(true);
    try {
      const result = await invoke<RepoStatus>("get_repo_status", { repoPath });
      if (gen !== refreshGeneration.current) return;
      const json = JSON.stringify(result);
      if (json !== lastStatusJson.current) {
        lastStatusJson.current = json;
        setStatus(result);
      }
      setStatusError(null);
    } catch (e) {
      if (gen !== refreshGeneration.current) return;
      setStatusError(String(e));
    } finally {
      hasLoaded.current = true;
      setStatusLoading(false);
      refreshInFlight.current = false;
    }
  }, [repoPath]);

  // Fetch repo metadata (default branch + protected branches) once per repo
  useEffect(() => {
    setDefaultBranch(null);
    setProtectedBranches(["main", "master", "develop"]);

    Promise.all([
      invoke<string>("get_default_base_branch", { repoPath }),
      invoke<ConfigEntry[]>("get_config_list", { repoPath }),
    ]).then(([branch, cfg]) => {
      setDefaultBranch(branch);
      const pb = cfg.find((e) => e.key === "protectedBranches");
      setProtectedBranches(
        Array.isArray(pb?.value) ? (pb.value as string[]) : ["main", "master", "develop"]
      );
    }).catch(() => {});
  }, [repoPath]);

  // Fetch open/draft PRs for branch indicators (non-critical, fire-and-forget)
  const fetchPrs = useCallback(async () => {
    if (!repoPath) return;
    try {
      const prs = await invoke<GithubPr[]>("list_prs", { repoPath });
      const map = new Map<string, GithubPr>();
      for (const pr of prs) {
        // Only include open PRs (OPEN state, which includes drafts)
        if (pr.state === "OPEN") {
          map.set(pr.headRefName, pr);
        }
      }
      setPrByBranch(map);
    } catch {
      // gh CLI not available or not in a GitHub repo — silently ignore
    }
  }, [repoPath]);

  // Fetch PRs once on mount, and again when remote is fetched
  const prsFetched = useRef(false);
  useEffect(() => {
    if (!repoPath || !status || prsFetched.current) return;
    prsFetched.current = true;
    fetchPrs();
  }, [repoPath, status, fetchPrs]);

  useEffect(() => {
    const unlisten = listen("remote-fetched", () => { fetchPrs(); });
    return () => { unlisten.then((fn) => fn()); };
  }, [fetchPrs]);

  // Watch repo for filesystem changes — only when active
  useEffect(() => {
    if (!isActive) return;

    hasLoaded.current = false;
    lastStatusJson.current = "";
    refreshInFlight.current = false;
    refreshGeneration.current = 0;
    refreshStatus();

    invoke("watch_repo", { repoPath }).catch(() => {});

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let unlisten: (() => void) | null = null;
    listen("repo-fs-changed", () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refreshStatus, 150);
    }).then((fn) => {
      unlisten = fn;
    });

    const interval = setInterval(refreshStatus, 5000);

    return () => {
      clearInterval(interval);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (unlisten) unlisten();
      invoke("unwatch_repo").catch(() => {});
    };
  }, [repoPath, isActive, refreshStatus]);

  // When tab becomes active again after being inactive, do a single refresh
  const wasActive = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActive.current) {
      refreshStatus();
    }
    wasActive.current = isActive;
  }, [isActive, refreshStatus]);

  // ── Auto-fetch classification on initial load ────────────────────
  // Always refresh classification when status loads, even if we have cached data.
  // Active tab: fetch immediately. Inactive tabs: fetch after a delay.
  // The UI will show the cached localStorage data while the refresh runs.
  const classificationFetched = useRef(false);
  useEffect(() => {
    if (!repoPath || !status || classificationFetched.current) return;
    classificationFetched.current = true;
    if (isActive) {
      fetchClassification();
    } else {
      const timer = setTimeout(fetchClassification, 3000);
      return () => clearTimeout(timer);
    }
  }, [repoPath, status, isActive, fetchClassification]);

  // ── Optimistic classification update on branch change ──────────
  // When the user checks out a different branch, immediately swap the
  // "current" label in the classification so the UI reflects the change
  // without waiting for a full rescan. Then trigger a background refresh.
  const lastClassifiedBranch = useRef<string | null>(null);
  useEffect(() => {
    const branch = status?.branch ?? null;
    if (!branch || !classification) {
      lastClassifiedBranch.current = branch;
      return;
    }
    const prevBranch = lastClassifiedBranch.current;
    lastClassifiedBranch.current = branch;

    // Only act when the branch actually changed
    if (!prevBranch || prevBranch === branch) return;

    // Optimistic update: swap current branch in the classification.
    // Update entries in-place to preserve the original ordering.
    setClassification((prev) => {
      if (!prev) return prev;

      const isProtected = prev.protected.includes(branch);
      const wasInKept = prev.kept.some(({ name }) => name === branch);
      const wasInSafe = prev.safe.some((r) => r.branch === branch);
      const wasInUnsafe = prev.unsafe.some((r) => r.branch === branch);

      // Update kept: change old current→"on remote", change new current→"current" (in-place)
      let newKept = prev.kept.map((entry) => {
        if (entry.name === prevBranch && entry.reason === "current") {
          return { ...entry, reason: "on remote" };
        }
        if (entry.name === branch) {
          return { ...entry, reason: "current" };
        }
        return entry;
      });

      // If the new branch wasn't already in kept (it was in safe/unsafe), insert it
      // right after the old current branch to maintain visual stability
      if (!wasInKept && !isProtected) {
        const prevIdx = newKept.findIndex(({ name }) => name === prevBranch);
        const newEntry = { name: branch, reason: "current" as const };
        if (prevIdx >= 0) {
          newKept = [...newKept.slice(0, prevIdx + 1), newEntry, ...newKept.slice(prevIdx + 1)];
        } else {
          newKept = [newEntry, ...newKept];
        }
      }

      // Remove the new branch from safe/unsafe if it was there
      const newSafe = wasInSafe ? prev.safe.filter((r) => r.branch !== branch) : prev.safe;
      const newUnsafe = wasInUnsafe ? prev.unsafe.filter((r) => r.branch !== branch) : prev.unsafe;

      return { ...prev, currentBranch: branch, kept: newKept, safe: newSafe, unsafe: newUnsafe };
    });

    // Background refresh to get the real classification
    fetchClassification();
  }, [status?.branch, classification, fetchClassification]);

  // ── Report tab status to parent (for dot indicators) ─────────────
  useEffect(() => {
    if (!onStatusReport || !status) return;
    const dirty = !status.isClean;
    const unpushed = status.aheadCount > 0;
    onStatusReport(tabId, { dirty, unpushed });
  }, [tabId, status, onStatusReport]);

  // ── Memoized context slices ───────────────────────────────────────
  // setRepoPath is a no-op within a tab — repo path is fixed per tab
  const setRepoPath = useCallback((_path: string | null) => {}, []);

  const repoPathCtx = useMemo(
    () => ({ repoPath, setRepoPath }),
    [repoPath, setRepoPath]
  );
  const statusCtx = useMemo(
    () => ({ status, statusLoading, statusError, refreshStatus }),
    [status, statusLoading, statusError, refreshStatus]
  );
  const selectionCtx = useMemo(
    () => ({ selectedBranch, setSelectedBranch, selectedCommitHash, setSelectedCommitHash }),
    [selectedBranch, setSelectedBranch, selectedCommitHash, setSelectedCommitHash]
  );
  const layoutCtx = useMemo(
    () => ({ layout, updateLayout }),
    [layout, updateLayout]
  );
  const classificationCtx = useMemo(
    () => ({ classification, classificationLoading, fetchClassification }),
    [classification, classificationLoading, fetchClassification]
  );
  const repoMetadataCtx = useMemo(
    () => ({ defaultBranch, protectedBranches }),
    [defaultBranch, protectedBranches]
  );
  const pullRequestsCtx = useMemo(
    () => ({ prByBranch }),
    [prByBranch]
  );
  const combinedCtx = useMemo(
    () => ({ ...repoPathCtx, ...statusCtx, ...selectionCtx, ...layoutCtx }),
    [repoPathCtx, statusCtx, selectionCtx, layoutCtx]
  );

  return (
    <RepoPathContext.Provider value={repoPathCtx}>
    <StatusContext.Provider value={statusCtx}>
    <SelectionContext.Provider value={selectionCtx}>
    <LayoutContext.Provider value={layoutCtx}>
    <ClassificationContext.Provider value={classificationCtx}>
    <RepoMetadataContext.Provider value={repoMetadataCtx}>
    <PullRequestsContext.Provider value={pullRequestsCtx}>
    <RepoContext.Provider value={combinedCtx}>
      <div className={`flex h-full w-full flex-col overflow-hidden ${isActive ? "" : "hidden"}`}>
        {/* Toolbar — full width, acts as custom titlebar */}
        <ErrorBoundary>
          <Toolbar activeAction={activeAction} onAction={setActiveAction} />
        </ErrorBoundary>

        {/* Status error banner */}
        {statusError && (
          <div className="flex items-center gap-2 bg-destructive/10 border-b border-destructive/20 px-3 py-1.5 text-xs text-destructive shrink-0">
            <span className="flex-1 truncate">{statusError}</span>
            <button
              onClick={() => { setStatusError(null); setStatus(null); }}
              className="shrink-0 rounded px-2 py-0.5 hover:bg-destructive/20 font-medium"
            >
              Dismiss
            </button>
            <button
              onClick={() => setStatusError(null)}
              className="shrink-0 rounded p-0.5 hover:bg-destructive/20"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Alert banner */}
        {alertMessage && (
          <div className="flex items-center gap-2 bg-destructive/10 border-b border-destructive/20 px-3 py-1.5 text-xs text-destructive shrink-0">
            <span className="flex-1 truncate">{alertMessage}</span>
            <button
              onClick={() => setAlertMessage(null)}
              className="shrink-0 rounded p-0.5 hover:bg-destructive/20"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Body: sidebar + main content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar: branches, remotes, tags */}
          <ErrorBoundary>
            <RepoSidebar width={layout.sidebarWidth} onError={setAlertMessage} />
          </ErrorBoundary>

          {/* Sidebar drag handle */}
          <div
            className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-brand/30 active:bg-brand/50 transition-colors"
            onMouseDown={sidebarDragHandle}
          />

          {/* Main area */}
          <div className="flex flex-1 flex-col overflow-hidden relative">
            {/* Content: log + staging */}
            <div ref={mainAreaRef} className="flex flex-1 flex-col overflow-hidden">
              {/* Commit log (top) */}
              <div
                className="overflow-hidden border-b bg-card"
                style={{ height: `${layout.logPanelPct}%` }}
              >
                <ErrorBoundary>
                  <CommitLog />
                </ErrorBoundary>
              </div>

              {/* Draggable divider between log and staging */}
              <div
                className="h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-brand/30 active:bg-brand/50 transition-colors"
                onMouseDown={logDragHandle}
              />

              {/* Staging + diff + commit (bottom) */}
              <div className="flex-1 min-h-0 overflow-hidden px-2">
                <ErrorBoundary>
                  <CommitView />
                </ErrorBoundary>
              </div>
            </div>

            {/* Slide-over panels for toolbar actions */}
            <SlideOver
              title="Pull Requests"
              open={activeAction === "pr"}
              onClose={() => setActiveAction(null)}
              raw
            >
              <ErrorBoundary>
                <PrView />
              </ErrorBoundary>
            </SlideOver>

            <SlideOver
              title="Branch Management"
              open={activeAction === "prune"}
              onClose={() => setActiveAction(null)}
              raw
            >
              <ErrorBoundary>
                <BranchesView />
              </ErrorBoundary>
            </SlideOver>

            <SlideOver
              title="Release"
              open={activeAction === "release"}
              onClose={() => setActiveAction(null)}
              raw
            >
              <ErrorBoundary>
                <ReleaseView />
              </ErrorBoundary>
            </SlideOver>

            <SlideOver
              title="Settings"
              open={activeAction === "settings"}
              onClose={() => setActiveAction(null)}
            >
              <ErrorBoundary>
                <SettingsView />
              </ErrorBoundary>
            </SlideOver>
          </div>
        </div>
      </div>
    </RepoContext.Provider>
    </PullRequestsContext.Provider>
    </RepoMetadataContext.Provider>
    </ClassificationContext.Provider>
    </LayoutContext.Provider>
    </SelectionContext.Provider>
    </StatusContext.Provider>
    </RepoPathContext.Provider>
  );
}
