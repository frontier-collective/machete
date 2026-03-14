import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Sun,
  Moon,
  GitPullRequest,
  Scissors,
  Rocket,
  Settings,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Loader2,
  Check,
  Pencil,
  ChevronDown,
  Search,
  GitBranch,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useRepoPath, useStatus, useRepoMetadata } from "@/hooks/useRepo";
import { useKeyboardShortcuts, type ShortcutDef } from "@/hooks/useKeyboardShortcuts";
import { useTheme } from "@/hooks/useTheme";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Kbd,
} from "@/components/ui/tooltip";
import type { BranchInfo } from "@/types";
import logoSvg from "@/assets/machete-logo.svg";

export type ToolbarAction = "pr" | "prune" | "release" | "settings" | null;

interface ToolbarProps {
  activeAction: ToolbarAction;
  onAction: (action: ToolbarAction) => void;
}

export function Toolbar({ activeAction, onAction }: ToolbarProps) {
  const { repoPath } = useRepoPath();
  const { status, refreshStatus } = useStatus();
  const { theme, toggle } = useTheme();
  const { protectedBranches } = useRepoMetadata();

  const [pushLoading, setPushLoading] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);

  // Branch switcher
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [branchFilter, setBranchFilter] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Fetch branches when popover opens
  useEffect(() => {
    if (!branchMenuOpen || !repoPath) return;
    setBranchFilter("");
    invoke<BranchInfo[]>("get_branches", { repoPath })
      .then(setBranches)
      .catch(() => {});
  }, [branchMenuOpen, repoPath]);

  const filteredBranches = useMemo(() => {
    if (!branchFilter) return branches;
    const q = branchFilter.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(q));
  }, [branches, branchFilter]);

  const handleSwitchBranch = useCallback(async (branch: string) => {
    if (!repoPath || checkoutLoading) return;
    setCheckoutLoading(branch);
    try {
      await invoke("checkout_branch", { repoPath, branch });
      setBranchMenuOpen(false);
      refreshStatus();
    } catch (e) {
      console.error("Checkout failed:", e);
    } finally {
      setCheckoutLoading(null);
    }
  }, [repoPath, checkoutLoading, refreshStatus]);

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
      emit("remote-fetched");
    } catch (e) {
      console.error("Fetch failed:", e);
    } finally {
      setFetchLoading(false);
    }
  }

  async function handleRefreshAll() {
    // Fetch remote first, then broadcast so all panels refresh
    await handleFetch();
    emit("refresh-all");
  }

  // Keyboard shortcuts for push/pull/fetch
  const toolbarShortcuts = useMemo<ShortcutDef[]>(
    () => [
      { key: "u", meta: true, shift: true, handler: handlePush },    // ⌘⇧U — Push
      { key: "l", meta: true, shift: true, handler: handlePull },    // ⌘⇧L — Pull
      { key: "f", meta: true, shift: true, handler: handleFetch },   // ⌘⇧F — Fetch
      { key: "r", meta: true, shift: true, handler: handleRefreshAll }, // ⌘⇧R — Refresh all remote state
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repoPath, pushLoading, pullLoading, fetchLoading]
  );
  useKeyboardShortcuts(toolbarShortcuts);

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
              <span className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center">
                      {status.isClean ? (
                        <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      ) : (
                        <Pencil className="h-3 w-3 text-amber-500 shrink-0" />
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{status.isClean ? "Working tree clean" : "Uncommitted changes"}</TooltipContent>
                </Tooltip>
                {!status.detachedAt && protectedBranches.includes(status.branch) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center">
                        <Shield className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Protected branch</TooltipContent>
                  </Tooltip>
                )}
              </span>
              <Popover open={branchMenuOpen} onOpenChange={setBranchMenuOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 font-medium hover:text-brand transition-colors rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 hover:bg-muted/50">
                    {status.detachedAt
                      ? <><span className="text-amber-500">HEAD</span> <span className="font-mono text-muted-foreground">({status.detachedAt})</span></>
                      : status.branch}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="center" sideOffset={8}>
                  <div className="flex items-center gap-2 border-b px-3 py-2">
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      placeholder="Filter branches…"
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {filteredBranches.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                        {branches.length === 0 ? "Loading…" : "No matching branches"}
                      </div>
                    ) : (
                      filteredBranches.map((b) => (
                        <button
                          key={b.name}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
                          disabled={b.current || checkoutLoading !== null}
                          onClick={() => handleSwitchBranch(b.name)}
                        >
                          {checkoutLoading === b.name ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-muted-foreground" />
                          ) : b.current ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                          ) : protectedBranches.includes(b.name) ? (
                            <Shield className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                          ) : (
                            <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate">{b.name}</span>
                          {b.current && (
                            <span className="ml-auto text-[10px] text-muted-foreground">current</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>

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
                  <TooltipContent>Pull<Kbd>⌘⇧L</Kbd></TooltipContent>
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
                  <TooltipContent>Push<Kbd>⌘⇧U</Kbd></TooltipContent>
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
                  <TooltipContent>Fetch<Kbd>⌘⇧F</Kbd></TooltipContent>
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
            <TooltipContent>Pull Requests<Kbd>⌘⇧P</Kbd></TooltipContent>
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
            <TooltipContent>Prune Branches<Kbd>⌘⇧B</Kbd></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeAction === "release" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => toggleAction("release")}
              >
                <Rocket className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Release<Kbd>⌘⇧E</Kbd></TooltipContent>
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
            <TooltipContent>Settings<Kbd>⌘,</Kbd></TooltipContent>
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
