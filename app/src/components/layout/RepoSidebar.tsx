import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  GitBranch,
  Globe,
  Tag,
  ChevronRight,
  ChevronDown,
  Folder,
  Loader2,
  Shield,
  Lock,
  ArrowUp,
  ArrowDown,
  Plus,
  MonitorSmartphone,
  Archive,
  Play,
  Trash2,
} from "lucide-react";

import { useRepoPath, useStatus, useSelection, useLayout, useClassification } from "@/hooks/useRepo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Kbd,
} from "@/components/ui/tooltip";
import { useKeyboardShortcuts, type ShortcutDef } from "@/hooks/useKeyboardShortcuts";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CreateBranchDialog } from "@/components/branches/CreateBranchDialog";
import { DeleteBranchDialog } from "@/components/branches/DeleteBranchDialog";
import { MergeRebaseDialog, type MergeMode } from "@/components/branches/MergeRebaseDialog";
import type { BranchInfo, RemoteInfo, ConfigEntry, StashEntry } from "@/types";

export function RepoSidebar({
  width,
  onError,
}: {
  width?: number;
  onError?: (msg: string | null) => void;
}) {
  const { repoPath } = useRepoPath();
  const { status, refreshStatus } = useStatus();
  const { selectedBranch, setSelectedBranch } = useSelection();
  const { layout, updateLayout } = useLayout();

  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [protectedBranches, setProtectedBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [stashLoading, setStashLoading] = useState<string | null>(null);

  // Section open/close state from persisted layout
  const branchesOpen = layout.branchesOpen;
  const remotesOpen = layout.remotesOpen;
  const tagsOpen = layout.tagsOpen;
  const stashesOpen = layout.stashesOpen;
  const expandedRemotes = useMemo(() => new Set(layout.expandedRemotes), [layout.expandedRemotes]);
  const expandedFolders = useMemo(() => new Set(layout.expandedFolders), [layout.expandedFolders]);

  // Checkout state
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Branch safety — shared context (synced with BranchesView)
  const { classification: safety, classificationLoading: safetyLoading, fetchClassification: handleAnalyzeSafety } = useClassification();

  // Create branch dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogSource, setCreateDialogSource] = useState<string | null>(null);

  // Merge/Rebase dialog state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeDialogMode, setMergeDialogMode] = useState<MergeMode>("merge");
  const [mergeDialogBranch, setMergeDialogBranch] = useState<string | null>(null);

  // Delete branch dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogBranch, setDeleteDialogBranch] = useState<string | null>(null);

  // Stash dialog state
  const [stashApplyConfirm, setStashApplyConfirm] = useState<StashEntry | null>(null);
  const [stashDropConfirm, setStashDropConfirm] = useState<StashEntry | null>(null);
  const [deleteAfterApply, setDeleteAfterApply] = useState(() => {
    try { return localStorage.getItem("machete:stash-delete-after-apply") !== "false"; } catch { return true; }
  });

  const fetchSidebarData = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      const [b, r, t, s, cfg] = await Promise.all([
        invoke<BranchInfo[]>("get_branches", { repoPath }),
        invoke<RemoteInfo[]>("get_remotes", { repoPath }),
        invoke<string[]>("get_tags", { repoPath }),
        invoke<StashEntry[]>("list_stashes", { repoPath }),
        invoke<ConfigEntry[]>("get_config_list", { repoPath }),
      ]);
      setBranches(b);
      setRemotes(r);
      setTags(t);
      setStashes(s);
      const pb = cfg.find((e) => e.key === "protectedBranches");
      setProtectedBranches(
        Array.isArray(pb?.value) ? (pb.value as string[]) : ["main", "master", "develop"]
      );
    } catch {
      // Silently fail — sidebar is non-critical
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  // Stable fingerprint: only refetch when branch or ahead/behind changes.
  // isClean is intentionally excluded — dirty state doesn't change the branch list.
  const sidebarTrigger = status
    ? `${status.branch}:${status.aheadCount}:${status.behindCount}`
    : "";

  useEffect(() => {
    fetchSidebarData();
  }, [fetchSidebarData, sidebarTrigger]);

  // Refresh sidebar when remote is fetched (e.g. toolbar Fetch button)
  useEffect(() => {
    const unlisten = listen("remote-fetched", () => {
      fetchSidebarData();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [fetchSidebarData]);

  const handleCheckout = async (branch: string) => {
    if (!repoPath || checkoutLoading) return;
    setCheckoutLoading(branch);
    onError?.(null);
    try {
      await invoke("checkout_branch", { repoPath, branch });
      refreshStatus();
    } catch (e) {
      onError?.(String(e));
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleCreateBranch = (sourceBranch: string) => {
    setCreateDialogSource(sourceBranch);
    setCreateDialogOpen(true);
  };

  const handleMerge = (branch: string) => {
    setMergeDialogBranch(branch);
    setMergeDialogMode("merge");
    setMergeDialogOpen(true);
  };

  const handleRebase = (branch: string) => {
    setMergeDialogBranch(branch);
    setMergeDialogMode("rebase");
    setMergeDialogOpen(true);
  };

  const handleDeleteBranch = (branch: string) => {
    setDeleteDialogBranch(branch);
    setDeleteDialogOpen(true);
  };

  const getBranchSafetyDot = (branchName: string): string | null => {
    if (!safety) return null;
    if (safety.protected.includes(branchName)) return "bg-blue-500";
    if (safety.safe.some((b) => b.branch === branchName)) return "bg-green-500";
    if (safety.unsafe.some((b) => b.branch === branchName)) return "bg-amber-500";
    return null;
  };

  const isBranchProtected = (branchName: string): boolean => {
    if (safety) return safety.protected.includes(branchName);
    return protectedBranches.includes(branchName);
  };

  const handleStashApplyDirect = async (stashRef: string) => {
    if (!repoPath || stashLoading) return;
    setStashLoading(stashRef);
    try {
      await invoke("apply_stash", { repoPath, stashRef, pop: deleteAfterApply });
      refreshStatus();
      fetchSidebarData();
    } catch (e) {
      onError?.(String(e));
    } finally {
      setStashLoading(null);
    }
  };

  const handleStashApplyConfirmed = async () => {
    if (!repoPath || stashLoading || !stashApplyConfirm) return;
    const stashRef = stashApplyConfirm.ref;
    setStashApplyConfirm(null);
    setStashLoading(stashRef);
    try {
      await invoke("apply_stash", { repoPath, stashRef, pop: deleteAfterApply });
      refreshStatus();
      fetchSidebarData();
    } catch (e) {
      onError?.(String(e));
    } finally {
      setStashLoading(null);
    }
  };

  const handleStashDropDirect = async (stashRef: string) => {
    if (!repoPath || stashLoading) return;
    setStashLoading(stashRef);
    try {
      await invoke("drop_stash", { repoPath, stashRef });
      fetchSidebarData();
    } catch (e) {
      onError?.(String(e));
    } finally {
      setStashLoading(null);
    }
  };

  const handleStashDropConfirmed = async () => {
    if (!repoPath || stashLoading || !stashDropConfirm) return;
    const stashRef = stashDropConfirm.ref;
    setStashDropConfirm(null);
    handleStashDropDirect(stashRef);
  };

  const toggleDeleteAfterApply = (checked: boolean) => {
    setDeleteAfterApply(checked);
    try { localStorage.setItem("machete:stash-delete-after-apply", String(checked)); } catch {}
  };

  const handleCreateStash = async () => {
    if (!repoPath) return;
    try {
      await invoke("create_stash", { repoPath, message: "", includeUntracked: true, stagedOnly: false });
      refreshStatus();
      fetchSidebarData();
      updateLayout({ stashesOpen: true });
    } catch (e) {
      onError?.(String(e));
    }
  };

  const toggleRemote = (name: string) => {
    const next = new Set(expandedRemotes);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    updateLayout({ expandedRemotes: [...next] });
  };

  const toggleFolder = (path: string) => {
    const next = new Set(expandedFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    updateLayout({ expandedFolders: [...next] });
  };

  const branchTree = useMemo(() => buildBranchTree(branches), [branches]);

  // Pre-build all remote trees once (not inside .map() render loop)
  const remoteTrees = useMemo(
    () => new Map(remotes.map((r) => [r.name, buildRemoteBranchTree(r.name, r.branches)])),
    [remotes]
  );

  // Sidebar keyboard shortcuts
  const sidebarShortcuts = useMemo<ShortcutDef[]>(
    () => [
      { key: "n", meta: true, shift: true, handler: () => handleCreateBranch(status?.branch ?? "HEAD") }, // ⌘⇧N — New branch
      { key: "s", meta: true, shift: true, handler: () => handleAnalyzeSafety() },                        // ⌘⇧S — Analyze safety
      { key: "t", meta: true, shift: true, handler: handleCreateStash },                                   // ⌘⇧T — Stash changes
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status?.branch, repoPath, safetyLoading]
  );
  useKeyboardShortcuts(sidebarShortcuts);

  return (
    <TooltipProvider delayDuration={400}>
    <aside className="flex h-full flex-col bg-muted/30 shrink-0" style={{ width: width ?? 220 }}>
      {loading && branches.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="py-1">
            {/* Branches */}
            <SectionHeader
              icon={GitBranch}
              label="Branches"
              count={branches.length}
              open={branchesOpen}
              onToggle={() => updateLayout({ branchesOpen: !branchesOpen })}
              action={
                <div className="flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateBranch(status?.branch ?? "HEAD");
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Create branch<Kbd>⌘⇧N</Kbd></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAnalyzeSafety();
                        }}
                      >
                        {safetyLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Shield className="h-3 w-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Analyze branch safety<Kbd>⌘⇧S</Kbd></TooltipContent>
                  </Tooltip>
                </div>
              }
            />
            {branchesOpen && (
              <div>
                <BranchTreeView
                  nodes={branchTree}
                  depth={0}
                  pathPrefix=""
                  checkoutLoading={checkoutLoading}
                  getBranchSafetyDot={getBranchSafetyDot}
                  isBranchProtected={isBranchProtected}
                  isDirty={!status?.isClean}
                  currentBranch={status?.branch ?? null}
                  onSelect={(name) => setSelectedBranch(name)}
                  onCheckout={handleCheckout}
                  onCreateBranch={handleCreateBranch}
                  onMerge={handleMerge}
                  onRebase={handleRebase}
                  onDelete={handleDeleteBranch}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                />
              </div>
            )}

            {/* Remotes */}
            <div className="mt-4" />
            <SectionHeader
              icon={Globe}
              label="Remotes"
              count={remotes.length}
              open={remotesOpen}
              onToggle={() => updateLayout({ remotesOpen: !remotesOpen })}
            />
            {remotesOpen && (
              <div>
                {remotes.map((r) => {
                  const remoteTree = remoteTrees.get(r.name) ?? [];
                  return (
                    <div key={r.name}>
                      <button
                        className="flex w-full items-center gap-1.5 rounded-sm py-0.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        style={{ paddingLeft: 16, paddingRight: 8 }}
                        onClick={() => toggleRemote(r.name)}
                      >
                        {expandedRemotes.has(r.name) ? (
                          <ChevronDown className="h-3 w-3 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 shrink-0" />
                        )}
                        <Folder className="h-3 w-3 shrink-0" />
                        <span className="font-medium">{r.name}</span>
                        <span className="ml-auto text-muted-foreground/60">{r.branches.length}</span>
                      </button>
                      {expandedRemotes.has(r.name) && (
                        <RemoteBranchTreeView
                          nodes={remoteTree}
                          depth={1}
                          pathPrefix={`remote:${r.name}/`}
                          remoteName={r.name}
                          selectedBranch={selectedBranch}
                          onSelect={(name) => setSelectedBranch(name)}
                          expandedFolders={expandedFolders}
                          toggleFolder={toggleFolder}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tags */}
            <div className="mt-4" />
            <SectionHeader
              icon={Tag}
              label="Tags"
              count={tags.length}
              open={tagsOpen}
              onToggle={() => updateLayout({ tagsOpen: !tagsOpen })}
            />
            {tagsOpen && (
              <div>
                {tags.length === 0 ? (
                  <div className="py-1 text-xs text-muted-foreground/60" style={{ paddingLeft: 34 }}>No tags</div>
                ) : (
                  tags.map((tag) => (
                    <button
                      key={tag}
                      className={`flex w-full truncate rounded-sm py-0.5 text-[14px] cursor-pointer ${
                        selectedBranch === `tag:${tag}`
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                      style={{ paddingLeft: 34, paddingRight: 8 }}
                      onClick={() => setSelectedBranch(`tag:${tag}`)}
                    >
                      {tag}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Stashes */}
            <div className="mt-4" />
            <SectionHeader
              icon={Archive}
              label="Stashes"
              count={stashes.length}
              open={stashesOpen}
              onToggle={() => updateLayout({ stashesOpen: !stashesOpen })}
            />
            {stashesOpen && (
              <div>
                {stashes.length === 0 ? (
                  <div className="py-1 text-xs text-muted-foreground/60" style={{ paddingLeft: 34 }}>No stashes</div>
                ) : (
                  stashes.map((stash) => (
                    <ContextMenu key={stash.ref}>
                      <ContextMenuTrigger asChild>
                        <div
                          className="group grid w-full items-center rounded-sm py-0.5 text-[14px] text-muted-foreground hover:text-foreground hover:bg-accent"
                          style={{ paddingLeft: 34, paddingRight: 8, gridTemplateColumns: "1fr auto" }}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate min-w-0">
                                <span className="text-muted-foreground/60 text-[12px] font-mono">{stash.index}</span>
                                {" "}
                                {stash.message}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-xs max-w-[300px]">{stash.message}</TooltipContent>
                          </Tooltip>
                          <span className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                            {stashLoading === stash.ref ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <button
                                  className="h-4 w-4 flex items-center justify-center rounded hover:bg-accent"
                                  onClick={() => handleStashApplyDirect(stash.ref)}
                                >
                                  <Play className="h-2.5 w-2.5" />
                                </button>
                                <button
                                  className="h-4 w-4 flex items-center justify-center rounded hover:bg-destructive/20 text-destructive"
                                  onClick={() => handleStashDropDirect(stash.ref)}
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
                              </>
                            )}
                          </span>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => setStashApplyConfirm(stash)}>
                          Apply stash
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setStashDropConfirm(stash)}
                        >
                          Delete stash
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Status legend */}
      {repoPath && (
        <div className="border-t px-3 py-2 shrink-0 flex items-center justify-center">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground justify-center">
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
              Uncommitted
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
              Protected
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
              Safe to delete
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
              Unsafe
            </span>
          </div>
        </div>
      )}

      {/* App info */}
      <div className="border-t px-3 py-1.5 shrink-0 flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground/50">
          {__APP_NAME__} v{__APP_VERSION__} by {__APP_AUTHOR__}
        </span>
      </div>

      {/* Create Branch Dialog */}
      <CreateBranchDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultSource={createDialogSource}
        branches={branches}
        onCreated={fetchSidebarData}
      />

      {/* Delete Branch Dialog */}
      <DeleteBranchDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        branch={deleteDialogBranch}
        branchInfo={deleteDialogBranch ? branches.find((b) => b.name === deleteDialogBranch) ?? null : null}
        onDeleted={fetchSidebarData}
      />

      {/* Merge / Rebase Dialog */}
      <MergeRebaseDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        mode={mergeDialogMode}
        defaultBranch={mergeDialogBranch}
        branches={branches}
        protectedBranches={protectedBranches}
        onCompleted={() => { fetchSidebarData(); refreshStatus(); }}
      />

      {/* Stash Apply Confirmation */}
      <Dialog open={!!stashApplyConfirm} onOpenChange={(open) => { if (!open) setStashApplyConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Stash</DialogTitle>
            <DialogDescription>
              Apply stash {stashApplyConfirm?.index}: {stashApplyConfirm?.message}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 py-2">
            <Checkbox
              id="delete-after-apply"
              checked={deleteAfterApply}
              onCheckedChange={(checked) => toggleDeleteAfterApply(!!checked)}
            />
            <Label htmlFor="delete-after-apply" className="text-sm cursor-pointer">
              Delete stash after applying
            </Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStashApplyConfirm(null)}>Cancel</Button>
            <Button onClick={handleStashApplyConfirmed}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stash Drop Confirmation */}
      <Dialog open={!!stashDropConfirm} onOpenChange={(open) => { if (!open) setStashDropConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Stash</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete stash {stashDropConfirm?.index}: {stashDropConfirm?.message}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStashDropConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleStashDropConfirmed}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
    </TooltipProvider>
  );
}

// --- Branch tree (folder grouping by "/") ---

interface BranchTreeNode {
  /** Folder or leaf name (last path segment) */
  name: string;
  /** Full branch name (only set for leaf nodes) */
  fullName?: string;
  /** BranchInfo for leaf nodes */
  info?: BranchInfo;
  /** Child nodes (folders or leaves) */
  children: BranchTreeNode[];
}

function buildBranchTree(branches: BranchInfo[]): BranchTreeNode[] {
  const root: BranchTreeNode = { name: "", children: [] };
  // Map for O(1) folder lookup at each level instead of .find() scans
  const folderMaps = new Map<BranchTreeNode, Map<string, BranchTreeNode>>();
  folderMaps.set(root, new Map());

  for (const b of branches) {
    const parts = b.name.split("/");
    let node = root;

    for (let i = 0; i < parts.length; i++) {
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        node.children.push({ name: parts[i], fullName: b.name, info: b, children: [] });
      } else {
        let fm = folderMaps.get(node)!;
        let folder = fm.get(parts[i]);
        if (!folder) {
          folder = { name: parts[i], children: [] };
          node.children.push(folder);
          fm.set(parts[i], folder);
          folderMaps.set(folder, new Map());
        }
        node = folder;
      }
    }
  }

  return root.children;
}

function BranchTreeView({
  nodes,
  depth,
  pathPrefix,
  checkoutLoading,
  getBranchSafetyDot,
  isBranchProtected,
  isDirty,
  currentBranch,
  onSelect,
  onCheckout,
  onCreateBranch,
  onMerge,
  onRebase,
  onDelete,
  expandedFolders,
  toggleFolder,
}: {
  nodes: BranchTreeNode[];
  depth: number;
  pathPrefix: string;
  checkoutLoading: string | null;
  getBranchSafetyDot: (name: string) => string | null;
  isBranchProtected: (name: string) => boolean;
  isDirty: boolean;
  currentBranch: string | null;
  onSelect: (name: string) => void;
  onCheckout: (name: string) => void;
  onCreateBranch: (sourceBranch: string) => void;
  onMerge: (branch: string) => void;
  onRebase: (branch: string) => void;
  onDelete: (branch: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
}) {
  // Alphabetical sort — folders and leaves mixed together
  const sorted = [...nodes].sort((a, b) => a.name.localeCompare(b.name));

  // Base left padding: depth 0 = 20px (enough indent under BRANCHES header)
  const basePad = 20;

  return (
    <>
      {sorted.map((node) => {
        if (node.fullName && node.info) {
          // Leaf: render branch with context menu
          const b = node.info;
          const isChecking = checkoutLoading === b.name;
          const safetyDot = getBranchSafetyDot(b.name);
          const isProtected = isBranchProtected(b.name);
          // Red dot if this is the current branch and there are uncommitted changes
          const showDirtyDot = b.current && isDirty;

          return (
            <ContextMenu key={b.name}>
              <ContextMenuTrigger asChild>
                <button
                  className={`grid w-full items-center rounded-sm py-0.5 text-[14px] text-left outline-none ${
                    b.current
                      ? "font-semibold text-foreground bg-accent/60"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                  } ${isChecking ? "opacity-50" : ""}`}
                  style={{ paddingLeft: `${basePad + depth * 14}px`, paddingRight: 8, gridTemplateColumns: "auto 1fr auto" }}
                  onClick={(e) => { if (e.button === 0) onSelect(b.name); }}
                  onDoubleClick={() => !b.current && onCheckout(b.name)}
                >
                  {showDirtyDot ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 shrink-0 mr-2" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">Uncommitted changes</TooltipContent>
                    </Tooltip>
                  ) : safetyDot ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${safetyDot} shrink-0 mr-2`} />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        {safetyDot.includes("green") ? "Safe to delete" : safetyDot.includes("blue") ? "Protected" : "Unsafe to delete"}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="inline-block h-1.5 w-1.5 shrink-0 mr-2" />
                  )}
                  <span className="truncate min-w-0">{node.name}</span>
                  {/* Right side: loading spinner, padlock, local-only, or ahead/behind */}
                  <span className="flex items-center gap-1.5 shrink-0 ml-1">
                    {isChecking && <Loader2 className="h-3 w-3 animate-spin" />}
                    {isProtected && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Lock className="h-3 w-3 text-muted-foreground/50" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">Protected branch</TooltipContent>
                      </Tooltip>
                    )}
                    {!b.hasRemote ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <MonitorSmartphone className="h-3 w-3 text-muted-foreground/40" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">Local only — no remote tracking branch</TooltipContent>
                      </Tooltip>
                    ) : (b.ahead > 0 || b.behind > 0) ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70 font-mono">
                            {b.behind > 0 && (
                              <span className="flex items-center gap-0.5">
                                {b.behind}
                                <ArrowDown className="h-3 w-3" />
                              </span>
                            )}
                            {b.ahead > 0 && (
                              <span className="flex items-center gap-0.5">
                                {b.ahead}
                                <ArrowUp className="h-3 w-3" />
                              </span>
                            )}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">
                          {b.ahead > 0 && b.behind > 0
                            ? `${b.ahead} ahead, ${b.behind} behind remote`
                            : b.ahead > 0
                            ? `${b.ahead} commit${b.ahead > 1 ? "s" : ""} ahead of remote`
                            : `${b.behind} commit${b.behind > 1 ? "s" : ""} behind remote`}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  disabled={b.current}
                  onClick={() => onCheckout(b.name)}
                >
                  Checkout
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => onCreateBranch(b.name)}>
                  Create branch from {node.name}...
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  disabled={b.current}
                  onClick={() => onMerge(b.name)}
                >
                  Merge {node.name} into current branch...
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={b.current}
                  onClick={() => onRebase(b.name)}
                >
                  Rebase current branch onto {node.name}...
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  disabled={b.current}
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(b.name)}
                >
                  Delete {node.name}...
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        }

        // Folder node
        const folderPath = pathPrefix + node.name + "/";
        const isOpen = expandedFolders.has(folderPath);

        return (
          <div key={`folder-${node.name}`}>
            <button
              className="flex w-full items-center gap-1.5 rounded-sm py-0.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50"
              style={{ paddingLeft: `${basePad + depth * 14 - 4}px`, paddingRight: 8 }}
              onClick={() => toggleFolder(folderPath)}
            >
              {isOpen ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
              <Folder className="h-3 w-3 shrink-0" />
              <span className="font-medium">{node.name}</span>
            </button>
            {isOpen && (
              <BranchTreeView
                nodes={node.children}
                depth={depth + 1}
                pathPrefix={folderPath}
                checkoutLoading={checkoutLoading}
                getBranchSafetyDot={getBranchSafetyDot}
                isBranchProtected={isBranchProtected}
                isDirty={isDirty}
                currentBranch={currentBranch}
                onSelect={onSelect}
                onCheckout={onCheckout}
                onCreateBranch={onCreateBranch}
                onMerge={onMerge}
                onRebase={onRebase}
                onDelete={onDelete}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

// --- Remote branch tree (folder grouping by "/", same visual style as local branches) ---

interface RemoteTreeNode {
  /** Folder or leaf name (last path segment) */
  name: string;
  /** Full ref name including remote prefix e.g. "origin/feature/foo" (only for leaves) */
  fullRef?: string;
  /** Child nodes */
  children: RemoteTreeNode[];
}

function buildRemoteBranchTree(remoteName: string, branches: string[]): RemoteTreeNode[] {
  const root: RemoteTreeNode = { name: "", children: [] };
  const folderMaps = new Map<RemoteTreeNode, Map<string, RemoteTreeNode>>();
  folderMaps.set(root, new Map());

  for (const fullRef of branches) {
    // Strip remote prefix to get the branch path
    const shortName = fullRef.replace(`${remoteName}/`, "");
    const parts = shortName.split("/");
    let node = root;

    for (let i = 0; i < parts.length; i++) {
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        node.children.push({ name: parts[i], fullRef, children: [] });
      } else {
        let fm = folderMaps.get(node)!;
        let folder = fm.get(parts[i]);
        if (!folder) {
          folder = { name: parts[i], children: [] };
          node.children.push(folder);
          fm.set(parts[i], folder);
          folderMaps.set(folder, new Map());
        }
        node = folder;
      }
    }
  }

  return root.children;
}

function RemoteBranchTreeView({
  nodes,
  depth,
  pathPrefix,
  remoteName,
  selectedBranch,
  onSelect,
  expandedFolders,
  toggleFolder,
}: {
  nodes: RemoteTreeNode[];
  depth: number;
  pathPrefix: string;
  remoteName: string;
  selectedBranch: string | null;
  onSelect: (name: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
}) {
  const sorted = [...nodes].sort((a, b) => a.name.localeCompare(b.name));
  const basePad = 20;

  return (
    <>
      {sorted.map((node) => {
        if (node.fullRef) {
          // Leaf node — remote branch
          return (
            <button
              key={node.fullRef}
              className={`flex w-full items-center gap-2 rounded-sm py-0.5 text-[14px] text-left cursor-pointer ${
                selectedBranch === node.fullRef
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              style={{ paddingLeft: `${basePad + depth * 14}px`, paddingRight: 8 }}
              onClick={() => onSelect(node.fullRef!)}
            >
              <span className="inline-block h-1.5 w-1.5 shrink-0" />
              <span className="truncate">{node.name}</span>
            </button>
          );
        }

        // Folder node
        const folderPath = pathPrefix + node.name + "/";
        const isOpen = expandedFolders.has(folderPath);

        return (
          <div key={`folder-${node.name}`}>
            <button
              className="flex w-full items-center gap-1.5 rounded-sm py-0.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50"
              style={{ paddingLeft: `${basePad + depth * 14 - 4}px`, paddingRight: 8 }}
              onClick={() => toggleFolder(folderPath)}
            >
              {isOpen ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
              <Folder className="h-3 w-3 shrink-0" />
              <span className="font-medium">{node.name}</span>
            </button>
            {isOpen && (
              <RemoteBranchTreeView
                nodes={node.children}
                depth={depth + 1}
                pathPrefix={folderPath}
                remoteName={remoteName}
                selectedBranch={selectedBranch}
                onSelect={onSelect}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

// Section header with collapsible toggle and optional action button
function SectionHeader({
  icon: Icon,
  label,
  count,
  open,
  onToggle,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center bg-muted/60">
      <button
        className="flex flex-1 items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent/50"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
        {count !== undefined && !action && (
          <span className="ml-auto font-bold text-muted-foreground/60">{count}</span>
        )}
      </button>
      {action && <div className="pr-1">{action}</div>}
      {count !== undefined && action && (
        <span className="pr-3 text-xs font-bold text-muted-foreground/60">{count}</span>
      )}
    </div>
  );
}
