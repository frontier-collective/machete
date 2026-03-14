import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
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
import { RepoContext, RepoPathContext, StatusContext, SelectionContext, LayoutContext, ClassificationContext, RepoMetadataContext } from "@/hooks/useRepo";
import { useRepoLayout } from "@/hooks/useRepoLayout";
import type { RepoStatus, PruneClassification, ConfigEntry } from "@/types";
import { Button } from "@/components/ui/button";
import { FolderOpen, X } from "lucide-react";

function App() {
  const [repoPath, setRepoPath] = useState<string | null>(
    () => localStorage.getItem("machete:repoPath")
  );
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const lastStatusJson = useRef<string>("");
  const hasLoaded = useRef(false);
  const refreshInFlight = useRef(false);
  const refreshGeneration = useRef(0);

  // Branch classification (shared between sidebar + BranchesView)
  const [classification, setClassification] = useState<PruneClassification | null>(null);
  const [classificationLoading, setClassificationLoading] = useState(false);

  const fetchClassification = useCallback(async () => {
    if (!repoPath || classificationLoading) return;
    setClassificationLoading(true);
    try {
      const result = await invoke<PruneClassification>("get_branch_classification", { repoPath });
      setClassification(result);
    } catch {
      // Non-critical
    } finally {
      setClassificationLoading(false);
    }
  }, [repoPath, classificationLoading]);

  // Repo metadata: default branch + protected branches (loaded once per repo)
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [protectedBranches, setProtectedBranches] = useState<string[]>(["main", "master", "develop"]);

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

  // ── Global keyboard shortcuts ────────────────────────────────────
  const toggleAction = useCallback((action: ToolbarAction) => {
    setActiveAction((prev) => (prev === action ? null : action));
  }, []);

  const shortcuts = useMemo<ShortcutDef[]>(
    () => [
      { key: ",", meta: true, handler: () => toggleAction("settings") },            // ⌘, — Settings
      { key: "p", meta: true, shift: true, handler: () => toggleAction("pr") },     // ⌘⇧P — PR panel
      { key: "b", meta: true, shift: true, handler: () => toggleAction("prune") },  // ⌘⇧B — Branches/prune
      { key: "e", meta: true, shift: true, handler: () => toggleAction("release") }, // ⌘⇧E — Release
    ],
    [toggleAction]
  );
  useKeyboardShortcuts(shortcuts);

  // Persist repo path
  useEffect(() => {
    if (repoPath) {
      localStorage.setItem("machete:repoPath", repoPath);
    } else {
      localStorage.removeItem("machete:repoPath");
    }
  }, [repoPath]);

  const refreshStatus = useCallback(async () => {
    if (!repoPath) return;
    // Backpressure: skip if a refresh is already in flight
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    // Generation counter: discard results if a newer refresh was requested
    const gen = ++refreshGeneration.current;
    if (!hasLoaded.current) setStatusLoading(true);
    try {
      const result = await invoke<RepoStatus>("get_repo_status", { repoPath });
      // Stale guard: only apply if this is still the latest generation
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
    if (!repoPath) return;
    setDefaultBranch(null);
    setProtectedBranches(["main", "master", "develop"]);

    // Fetch default branch and protected branches in parallel
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

  // Watch repo for filesystem changes and refresh on events
  useEffect(() => {
    if (!repoPath) return;
    hasLoaded.current = false;
    lastStatusJson.current = "";
    refreshInFlight.current = false;
    refreshGeneration.current = 0;
    setClassification(null);
    refreshStatus();

    // Start the native file watcher
    invoke("watch_repo", { repoPath }).catch(() => {
      // Watcher failed — fall back to polling
    });

    // Debounce watcher events: coalesce rapid fs changes into one refresh
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let unlisten: (() => void) | null = null;
    listen("repo-fs-changed", () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refreshStatus, 150);
    }).then((fn) => {
      unlisten = fn;
    });

    // Fallback poll every 5s in case watcher misses something
    const interval = setInterval(refreshStatus, 5000);

    return () => {
      clearInterval(interval);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (unlisten) unlisten();
      invoke("unwatch_repo").catch(() => {});
    };
  }, [repoPath, refreshStatus]);

  const handleOpenRepo = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      setRepoPath(selected);
    }
  };

  // ── Memoized context slices (must be before any early return) ───
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
  // Legacy combined value — components still using useRepo() get this
  const combinedCtx = useMemo(
    () => ({ ...repoPathCtx, ...statusCtx, ...selectionCtx, ...layoutCtx }),
    [repoPathCtx, statusCtx, selectionCtx, layoutCtx]
  );

  // Welcome screen when no repo
  if (!repoPath) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Machete</h1>
          <p className="text-muted-foreground">A sharp GUI for managing git repositories</p>
          <Button size="lg" onClick={handleOpenRepo} className="gap-2">
            <FolderOpen className="h-5 w-5" />
            Open Repository
          </Button>
        </div>
      </div>
    );
  }

  return (
    <RepoPathContext.Provider value={repoPathCtx}>
    <StatusContext.Provider value={statusCtx}>
    <SelectionContext.Provider value={selectionCtx}>
    <LayoutContext.Provider value={layoutCtx}>
    <ClassificationContext.Provider value={classificationCtx}>
    <RepoMetadataContext.Provider value={repoMetadataCtx}>
    <RepoContext.Provider value={combinedCtx}>
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        {/* Toolbar — full width, acts as custom titlebar */}
        <ErrorBoundary>
          <Toolbar activeAction={activeAction} onAction={setActiveAction} />
        </ErrorBoundary>

        {/* Status error banner */}
        {statusError && (
          <div className="flex items-center gap-2 bg-destructive/10 border-b border-destructive/20 px-3 py-1.5 text-xs text-destructive shrink-0">
            <span className="flex-1 truncate">{statusError}</span>
            <button
              onClick={() => { setRepoPath(null); setStatusError(null); setStatus(null); }}
              className="shrink-0 rounded px-2 py-0.5 hover:bg-destructive/20 font-medium"
            >
              Change Repo
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
    </RepoMetadataContext.Provider>
    </ClassificationContext.Provider>
    </LayoutContext.Provider>
    </SelectionContext.Provider>
    </StatusContext.Provider>
    </RepoPathContext.Provider>
  );
}

export default App;
