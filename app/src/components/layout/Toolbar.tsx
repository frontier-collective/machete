import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Sun,
  Moon,
  GitPullRequest,
  Scissors,
  Settings,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRepoPath, useStatus } from "@/hooks/useRepo";
import { useTheme } from "@/hooks/useTheme";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import logoSvg from "@/assets/machete-logo.svg";

export type ToolbarAction = "pr" | "prune" | "settings" | null;

interface ToolbarProps {
  activeAction: ToolbarAction;
  onAction: (action: ToolbarAction) => void;
}

export function Toolbar({ activeAction, onAction }: ToolbarProps) {
  const { repoPath } = useRepoPath();
  const { status, refreshStatus } = useStatus();
  const { theme, toggle } = useTheme();

  const [pushLoading, setPushLoading] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);

  const toggleAction = (action: ToolbarAction) => {
    onAction(activeAction === action ? null : action);
  };

  /** Start native window drag on mousedown; double-click to toggle maximize */
  const handleDragMouseDown = async (e: React.MouseEvent) => {
    // Only left button, and only if the target is the drag layer itself
    if (e.button !== 0) return;
    const appWindow = getCurrentWindow();
    if (e.detail === 2) {
      // Double-click → toggle maximize
      if (await appWindow.isMaximized()) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } else {
      await appWindow.startDragging();
    }
  };

  async function handlePush() {
    if (!repoPath || pushLoading) return;
    setPushLoading(true);
    try {
      await invoke("push_current_branch", { repoPath });
      refreshStatus();
    } catch (e) {
      console.error("Push failed:", e);
    } finally {
      setPushLoading(false);
    }
  }

  async function handlePull() {
    if (!repoPath || pullLoading) return;
    setPullLoading(true);
    try {
      await invoke("pull_current_branch", { repoPath });
      refreshStatus();
    } catch (e) {
      console.error("Pull failed:", e);
    } finally {
      setPullLoading(false);
    }
  }

  async function handleFetch() {
    if (!repoPath || fetchLoading) return;
    setFetchLoading(true);
    try {
      await invoke("fetch_remote", { repoPath });
      refreshStatus();
    } catch (e) {
      console.error("Fetch failed:", e);
    } finally {
      setFetchLoading(false);
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <header
        className="relative flex h-10 items-center border-b shrink-0 select-none bg-background"
      >
        {/* Full-width drag layer behind all content — uses JS startDragging API */}
        <div
          className="absolute inset-0"
          onMouseDown={handleDragMouseDown}
        />

        {/* Left: logo + branding */}
        <div className="relative flex items-center gap-1.5 text-sm pl-[84px] shrink-0 pointer-events-none">
          <img src={logoSvg} alt="Machete" className="h-5 w-5 rounded-sm" />
          <span className="text-sm font-bold tracking-tight">Machete</span>
        </div>

        {/* Center: branch status + push/pull/fetch (absolutely centered) */}
        {status && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative flex items-center gap-3 text-sm pointer-events-auto">
              <span
                className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                  status.isClean ? "bg-green-500" : "bg-amber-500"
                }`}
              />
              <span className="font-medium">{status.branch}</span>

              {(status.aheadCount > 0 || status.behindCount > 0) && (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {status.aheadCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <ArrowUp className="h-3 w-3" />
                      {status.aheadCount}
                    </span>
                  )}
                  {status.behindCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <ArrowDown className="h-3 w-3" />
                      {status.behindCount}
                    </span>
                  )}
                </span>
              )}

              {/* Push / Pull / Fetch */}
              <div className="flex items-center gap-0.5 ml-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={handlePull}
                      disabled={pullLoading || (!status.behindCount && !pullLoading)}
                    >
                      {pullLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Pull</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={handlePush}
                      disabled={pushLoading || (!status.aheadCount && !pushLoading)}
                    >
                      {pushLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowUp className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Push</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={handleFetch}
                      disabled={fetchLoading}
                    >
                      {fetchLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fetch</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        )}

        {/* Right: action buttons (pushed to far right) */}
        <div className="relative flex items-center gap-1 pr-3 ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeAction === "pr" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => toggleAction("pr")}
              >
                <GitPullRequest className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create PR</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeAction === "prune" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => toggleAction("prune")}
              >
                <Scissors className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Prune Branches</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeAction === "settings" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => toggleAction("settings")}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>

          <div className="mx-1 h-4 w-px bg-border" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={toggle}>
                {theme === "dark" ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  );
}
