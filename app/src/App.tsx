import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Shell } from "@/components/layout/Shell";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { CommitView } from "@/components/commit/CommitView";
import { BranchesView } from "@/components/branches/BranchesView";
import { PrView } from "@/components/pr/PrView";
import { ReleaseView } from "@/components/release/ReleaseView";
import { SettingsView } from "@/components/settings/SettingsView";
import { RepoContext } from "@/hooks/useRepo";
import type { View, RepoStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";

function App() {
  const [currentView, setCurrentView] = useState<View>(
    () => (localStorage.getItem("machete:view") as View) || "dashboard"
  );
  const [repoPath, setRepoPath] = useState<string | null>(
    () => localStorage.getItem("machete:repoPath")
  );
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const lastStatusJson = useRef<string>("");
  const hasLoaded = useRef(false);

  // Persist repo path and view to localStorage for HMR survival
  useEffect(() => {
    if (repoPath) {
      localStorage.setItem("machete:repoPath", repoPath);
    } else {
      localStorage.removeItem("machete:repoPath");
    }
  }, [repoPath]);

  useEffect(() => {
    localStorage.setItem("machete:view", currentView);
  }, [currentView]);

  const refreshStatus = useCallback(async () => {
    if (!repoPath) return;
    // Only show loading spinner on first fetch
    if (!hasLoaded.current) setStatusLoading(true);
    try {
      const result = await invoke<RepoStatus>("get_repo_status", { repoPath });
      const json = JSON.stringify(result);
      // Only update state if data actually changed
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
      setCurrentView("dashboard");
    }
  };

  // Repo selector screen
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

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return <DashboardView onNavigate={setCurrentView} />;
      case "commit":
        return <CommitView />;
      case "branches":
        return <BranchesView />;
      case "pr":
        return <PrView />;
      case "release":
        return <ReleaseView />;
      case "settings":
        return <SettingsView />;
    }
  };

  return (
    <RepoContext.Provider
      value={{ repoPath, setRepoPath, status, statusLoading, statusError, refreshStatus }}
    >
      <Shell currentView={currentView} onNavigate={setCurrentView}>
        <ErrorBoundary>
          {renderView()}
        </ErrorBoundary>
      </Shell>
    </RepoContext.Provider>
  );
}

export default App;
