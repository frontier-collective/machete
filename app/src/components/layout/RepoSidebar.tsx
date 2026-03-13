import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GitBranch,
  Globe,
  Tag,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  Loader2,
  Shield,
  Lock,
  ArrowUp,
  ArrowDown,
  Plus,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useRepo } from "@/hooks/useRepo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { CreateBranchDialog } from "@/components/branches/CreateBranchDialog";
import type { BranchInfo, RemoteInfo, PruneClassification, ConfigEntry } from "@/types";

export function RepoSidebar({
  width,
  onError,
}: {
  width?: number;
  onError?: (msg: string | null) => void;
}) {
  const { repoPath, setRepoPath, status, refreshStatus, setSelectedBranch, selectedBranch, layout, updateLayout } = useRepo();

  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [protectedBranches, setProtectedBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Section open/close state from persisted layout
  const branchesOpen = layout.branchesOpen;
  const remotesOpen = layout.remotesOpen;
  const tagsOpen = layout.tagsOpen;
  const expandedRemotes = useMemo(() => new Set(layout.expandedRemotes), [layout.expandedRemotes]);
  const expandedFolders = useMemo(() => new Set(layout.expandedFolders), [layout.expandedFolders]);

  // Checkout state
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Branch safety state
  const [safety, setSafety] = useState<PruneClassification | null>(null);
  const [safetyLoading, setSafetyLoading] = useState(false);

  // Create branch dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogSource, setCreateDialogSource] = useState<string | null>(null);

  const fetchSidebarData = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      const [b, r, t, cfg] = await Promise.all([
        invoke<BranchInfo[]>("get_branches", { repoPath }),
        invoke<RemoteInfo[]>("get_remotes", { repoPath }),
        invoke<string[]>("get_tags", { repoPath }),
        invoke<ConfigEntry[]>("get_config_list", { repoPath }),
      ]);
      setBranches(b);
      setRemotes(r);
      setTags(t);
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

  // Refresh sidebar data when repo changes or status updates (commit, branch switch, tag, etc.)
  useEffect(() => {
    fetchSidebarData();
  }, [fetchSidebarData, status]);

  const handleOpenRepo = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      setRepoPath(selected);
    }
  };

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

  const handleAnalyzeSafety = async () => {
    if (!repoPath || safetyLoading) return;
    setSafetyLoading(true);
    try {
      const result = await invoke<PruneClassification>("get_branch_classification", { repoPath });
      setSafety(result);
    } catch {
      // Non-critical
    } finally {
      setSafetyLoading(false);
    }
  };

  const handleCreateBranch = (sourceBranch: string) => {
    setCreateDialogSource(sourceBranch);
    setCreateDialogOpen(true);
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

  const repoName = repoPath
    ? repoPath.replace(/\/+$/, "").split("/").pop() || "Repo"
    : null;

  return (
    <aside className="flex h-full flex-col bg-muted/30 shrink-0" style={{ width: width ?? 220 }}>
      {/* Repo selector */}
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-start gap-2 text-left font-semibold text-sm h-8 px-2"
          onClick={handleOpenRepo}
        >
          <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{repoName || "Open Repo..."}</span>
        </Button>
      </div>

      {!repoPath ? (
        <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
          No repository open
        </div>
      ) : loading && branches.length === 0 ? (
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
              open={branchesOpen}
              onToggle={() => updateLayout({ branchesOpen: !branchesOpen })}
              action={
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateBranch(status?.branch ?? "HEAD");
                    }}
                    title="Create branch"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAnalyzeSafety();
                    }}
                    title="Analyze branch safety"
                  >
                    {safetyLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Shield className="h-3 w-3" />
                    )}
                  </Button>
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
                  const remoteTree = buildRemoteBranchTree(r.name, r.branches);
                  return (
                    <div key={r.name}>
                      <button
                        className="flex w-full items-center gap-1.5 rounded-sm py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50"
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
                      className={`flex w-full truncate rounded-sm py-0.5 text-xs cursor-pointer ${
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
          </div>
        </ScrollArea>
      )}

      {/* Create Branch Dialog */}
      <CreateBranchDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultSource={createDialogSource}
        branches={branches}
        onCreated={fetchSidebarData}
      />
    </aside>
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

  for (const b of branches) {
    const parts = b.name.split("/");
    let node = root;

    for (let i = 0; i < parts.length; i++) {
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        node.children.push({ name: parts[i], fullName: b.name, info: b, children: [] });
      } else {
        let folder = node.children.find((c) => !c.fullName && c.name === parts[i]);
        if (!folder) {
          folder = { name: parts[i], children: [] };
          node.children.push(folder);
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
                  className={`flex w-full items-center gap-2 rounded-sm py-0.5 text-xs text-left ${
                    b.current
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                  } ${isChecking ? "opacity-50" : ""}`}
                  style={{ paddingLeft: `${basePad + depth * 14}px`, paddingRight: 8 }}
                  onClick={() => onSelect(b.name)}
                  onDoubleClick={() => !b.current && onCheckout(b.name)}
                >
                  {showDirtyDot ? (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  ) : safetyDot ? (
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${safetyDot} shrink-0`} />
                  ) : (
                    <span className="inline-block h-1.5 w-1.5 shrink-0" />
                  )}
                  <span className="truncate">{node.name}</span>
                  {/* Right side: loading spinner, padlock, or ahead/behind */}
                  <span className="ml-auto flex items-center gap-1.5 shrink-0">
                    {isChecking && <Loader2 className="h-3 w-3 animate-spin" />}
                    {isProtected && <Lock className="h-3 w-3 text-muted-foreground/50" />}
                    {(b.ahead > 0 || b.behind > 0) && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70 font-mono">
                        {b.behind > 0 && (
                          <span className="flex items-center gap-0.5">
                            {b.behind}
                            <ArrowDown className="h-2.5 w-2.5" />
                          </span>
                        )}
                        {b.ahead > 0 && (
                          <span className="flex items-center gap-0.5">
                            {b.ahead}
                            <ArrowUp className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </span>
                    )}
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
              className="flex w-full items-center gap-1.5 rounded-sm py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50"
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
        let folder = node.children.find((c) => !c.fullRef && c.name === parts[i]);
        if (!folder) {
          folder = { name: parts[i], children: [] };
          node.children.push(folder);
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
              className={`flex w-full items-center gap-2 rounded-sm py-0.5 text-xs text-left cursor-pointer ${
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
              className="flex w-full items-center gap-1.5 rounded-sm py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50"
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
        {count !== undefined && (
          <span className="ml-auto font-normal text-muted-foreground/60">{count}</span>
        )}
      </button>
      {action && <div className="pr-2">{action}</div>}
    </div>
  );
}
