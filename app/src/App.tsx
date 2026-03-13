import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
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
import type { RepoStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";

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

  // Resizable: log panel height (percentage of main area)
  const [logPanelPct, setLogPanelPct] = useState(35);
  const mainAreaRef = useRef<HTMLDivElement>(null);

  const onLogDrag = useCallback((delta: number) => {
    const area = mainAreaRef.current;
    if (!area) return;
    const h = area.getBoundingClientRect().height;
    if (h <= 0) return;
    const pctDelta = (delta / h) * 100;
    setLogPanelPct((prev) => Math.min(70, Math.max(15, prev + pctDelta)));
  }, []);
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

  // Poll status every 3 seconds
  useEffect(() => {
    if (!repoPath) return;
    hasLoaded.current = false;
    lastStatusJson.current = "";
    refreshStatus();
    const interval = setInterval(refreshStatus, 3000);
    return () => clearInterval(interval);
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
      value={{ repoPath, setRepoPath, status, statusLoading, statusError, refreshStatus }}
    >
      <div className="flex h-screen w-screen overflow-hidden">
        {/* Sidebar: branches, remotes, tags */}
        <RepoSidebar />

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden relative">
          {/* Toolbar */}
          <Toolbar activeAction={activeAction} onAction={setActiveAction} />

          {/* Content: log + staging */}
          <div ref={mainAreaRef} className="flex flex-1 flex-col overflow-hidden">
            {/* Commit log (top) */}
            <div
              className="overflow-hidden border-b bg-card"
              style={{ height: `${logPanelPct}%` }}
            >
              <ErrorBoundary>
                <CommitLog />
              </ErrorBoundary>
            </div>

            {/* Draggable divider between log and staging */}
            <div
              className="h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-primary/30 active:bg-primary/50 transition-colors"
              onMouseDown={logDragHandle}
            />

            {/* Staging + diff + commit (bottom) */}
            <div className="flex-1 min-h-0 overflow-hidden">
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
    </RepoContext.Provider>
  );
}

export default App;
