import { useState, useEffect, useCallback, useRef } from "react";
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
import { SettingsView } from "@/components/settings/SettingsView";
import { useDrag } from "@/hooks/useDrag";
import { RepoContext } from "@/hooks/useRepo";
import { useRepoLayout } from "@/hooks/useRepoLayout";
import type { RepoStatus } from "@/types";
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
    if (!hasLoaded.current) setStatusLoading(true);
    try {
      const result = await invoke<RepoStatus>("get_repo_status", { repoPath });
      const json = JSON.stringify(result);
      if (json !== lastStatusJson.current) {
        lastStatusJson.current = json;
        setStatus(result);
      }
      setStatusError(null);
    } catch (e) {
      setStatusError(String(e));
    } finally {
      hasLoaded.current = true;
      setStatusLoading(false);
    }
  }, [repoPath]);

  // Watch repo for filesystem changes and refresh on events
  useEffect(() => {
    if (!repoPath) return;
    hasLoaded.current = false;
    lastStatusJson.current = "";
    refreshStatus();

    // Start the native file watcher
    invoke("watch_repo", { repoPath }).catch(() => {
      // Watcher failed — fall back to polling
    });

    // Listen for fs change events from the watcher
    let unlisten: (() => void) | null = null;
    listen("repo-fs-changed", () => {
      refreshStatus();
    }).then((fn) => {
      unlisten = fn;
    });

    // Fallback poll every 5s in case watcher misses something
    const interval = setInterval(refreshStatus, 5000);

    return () => {
      clearInterval(interval);
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
    <RepoContext.Provider
      value={{ repoPath, setRepoPath, status, statusLoading, statusError, refreshStatus, selectedBranch, setSelectedBranch, selectedCommitHash, setSelectedCommitHash, layout, updateLayout }}
    >
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        {/* Toolbar — full width, acts as custom titlebar */}
        <Toolbar activeAction={activeAction} onAction={setActiveAction} />

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
          <RepoSidebar width={layout.sidebarWidth} onError={setAlertMessage} />

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
              title="Create Pull Request"
              open={activeAction === "pr"}
              onClose={() => setActiveAction(null)}
            >
              <ErrorBoundary>
                <PrView />
              </ErrorBoundary>
            </SlideOver>

            <SlideOver
              title="Branch Management"
              open={activeAction === "prune"}
              onClose={() => setActiveAction(null)}
            >
              <ErrorBoundary>
                <BranchesView />
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
  );
}

export default App;
