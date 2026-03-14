import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import {
  GitBranch,
  Shield,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Scissors,
  GitMerge,
  Search,
  ChevronDown,
  ChevronRight,
  Plus,
  Undo2,
} from "lucide-react";
import { useRepoPath, useStatus, useClassification } from "@/hooks/useRepo";
import type { BranchSafetyResult } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

export function BranchesView() {
  const { repoPath } = useRepoPath();
  const { refreshStatus } = useStatus();
  const { classification, classificationLoading: loading, fetchClassification } = useClassification();

  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  // Kept branches the user has promoted to the "safe to delete" list
  const [promoted, setPromoted] = useState<Set<string>>(new Set());

  // Collapsible sections
  const [keptOpen, setKeptOpen] = useState(false);
  const [unsafeOpen, setUnsafeOpen] = useState(false);

  // Auto-rescan when the view mounts (sheet opens), but only if we already have data to refresh.
  // If no prior scan exists, show the intro/splash screen and let the user trigger it.
  const hasAutoScanned = useRef(false);
  useEffect(() => {
    if (!repoPath || hasAutoScanned.current || !classification) return;
    hasAutoScanned.current = true;
    fetchClassification();
  }, [repoPath, classification, fetchClassification]);

  const toggleBranch = (branch: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(branch)) {
        next.delete(branch);
      } else {
        next.add(branch);
      }
      return next;
    });
  };

  const selectAllSafe = () => {
    if (!classification) return;
    const all = new Set(classification.safe.map((b) => b.branch));
    for (const name of promoted) all.add(name);
    setSelected(all);
  };

  const promoteBranch = (name: string) => {
    setPromoted((prev) => new Set(prev).add(name));
  };

  const unpromoteBranch = (name: string) => {
    setPromoted((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!repoPath || selected.size === 0) return;
    setDeleting(true);
    try {
      await invoke("delete_branches", {
        repoPath,
        branches: Array.from(selected),
      });
      setDeleteResult(`Deleted ${selected.size} branch${selected.size === 1 ? "" : "es"}.`);
      setConfirmOpen(false);
      setSelected(new Set());
      setPromoted(new Set());
      await fetchClassification();
      refreshStatus();
      emit("remote-fetched"); // refresh sidebar branch list + commit log
    } catch (e) {
      setError(String(e));
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const mergeTarget = (result: BranchSafetyResult): string | null => {
    if (result.mergedInto.length > 0) return result.mergedInto[0];
    if (result.squashMergedInto.length > 0) return result.squashMergedInto[0];
    return null;
  };

  const isSquashMerge = (result: BranchSafetyResult): boolean => {
    return result.squashMergedInto.length > 0 && result.mergedInto.length === 0;
  };

  if (!repoPath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Open a repository to get started.
      </div>
    );
  }

  // ─── Pre-scan intro ────────────────────────────────────────────────

  if (!classification && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-6 select-none">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
          <Scissors className="h-8 w-8 text-brand" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold">Branch Pruning</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Safely identify and remove local branches that have been merged or are no longer needed.
          </p>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground max-w-xs">
          <div className="flex items-start gap-3">
            <GitMerge className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
            <span>Detects branches merged via regular merge or squash-merge</span>
          </div>
          <div className="flex items-start gap-3">
            <Search className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
            <span>Finds stale branches with no unpushed work</span>
          </div>
          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
            <span>Protects important branches — never deletes unsafely</span>
          </div>
        </div>
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={fetchClassification} className="mt-2">
                <RefreshCw className="mr-2 h-4 w-4" />
                Scan Branches
              </Button>
            </TooltipTrigger>
            <TooltipContent>Analyze branches for safe deletion</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // ─── Post-scan results ─────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={400}>
    <div className="flex h-full flex-col select-none">
      {/* Loading overlay — only shown for initial scan (no existing data) */}
      {loading && !classification && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Scanning branches...
        </div>
      )}

      {classification && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0 flex-wrap">
            {classification.protected.length > 0 && (
              <Badge variant="protected">{classification.protected.length} protected</Badge>
            )}
            {classification.kept.length - promoted.size > 0 && (
              <Badge variant="secondary">{classification.kept.length - promoted.size} kept</Badge>
            )}
            <Badge variant="safe">{classification.safe.length + promoted.size} safe to delete</Badge>
            {classification.unsafe.length > 0 && (
              <Badge variant="unsafe">{classification.unsafe.length} unsafe</Badge>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={fetchClassification} disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Re-scan branches</TooltipContent>
            </Tooltip>
          </div>

          {/* Error / success banners */}
          {error && (
            <div className="mx-4 mt-3 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          {deleteResult && (
            <div className="mx-4 mt-3 flex items-center gap-2 rounded-md bg-green-500/10 px-4 py-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {deleteResult}
            </div>
          )}

          {/* Scrollable branch lists */}
          <ScrollArea className="flex-1 min-h-0 select-none [&>div>div]:!overflow-x-hidden">
            <div className="px-4 py-3 space-y-4 overflow-hidden w-full">
              {/* Kept Branches (collapsible) */}
              {(() => {
                const remainingKept = classification.kept.filter(({ name }) => !promoted.has(name));
                const visibleKeptCount = classification.protected.length + remainingKept.length;
                // Branches that can be promoted: on remote and not the current branch
                const canPromote = (reason: string) => reason === "on remote";

                return visibleKeptCount > 0 ? (
                  <div>
                    <button
                      className="flex w-full items-center gap-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      onClick={() => setKeptOpen(!keptOpen)}
                    >
                      {keptOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      Kept Branches
                      <Badge variant="secondary" className="ml-1">{visibleKeptCount}</Badge>
                    </button>
                    {keptOpen && (
                      <div className="mt-1 space-y-0.5">
                        {classification.protected.map((branch) => (
                          <div
                            key={branch}
                            className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-muted/50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Shield className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              <span className="font-mono truncate">{branch}</span>
                            </div>
                            <Badge variant="protected">protected</Badge>
                          </div>
                        ))}
                        {remainingKept.map(({ name, reason }) => (
                          <div
                            key={name}
                            className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-muted/50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-mono truncate">{name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="secondary">{reason}</Badge>
                              {canPromote(reason) && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="rounded p-0.5 text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors"
                                      onClick={() => promoteBranch(name)}
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Include in safe-to-delete list</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null;
              })()}

              {/* Safe to Delete (primary focus) */}
              {(() => {
                const totalSafe = classification.safe.length + promoted.size;
                return (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/5 overflow-hidden min-w-0">
                    <div className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-semibold">Safe to Delete</span>
                        <Badge variant="safe">{totalSafe}</Badge>
                      </div>
                      {totalSafe > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={selectAllSafe}>
                              Select All
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Select all safe-to-delete branches</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="px-3 pb-3">
                      {totalSafe === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                          No branches are safe to delete.
                        </p>
                      ) : (
                        <div className="space-y-0.5">
                          {classification.safe.map((result) => {
                            const target = mergeTarget(result);
                            const squash = isSquashMerge(result);
                            return (
                              <div
                                key={result.branch}
                                className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm hover:bg-green-500/10 cursor-pointer min-w-0"
                                onClick={() => toggleBranch(result.branch)}
                              >
                                <Checkbox
                                  checked={selected.has(result.branch)}
                                  onCheckedChange={() => toggleBranch(result.branch)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="font-mono flex-1 truncate">{result.branch}</span>
                                {target && (
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    {squash ? "squash" : "merged"} &rarr; {target}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {/* Promoted branches (moved from kept) */}
                          {Array.from(promoted).map((name) => (
                            <div
                              key={name}
                              className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm hover:bg-green-500/10 cursor-pointer min-w-0"
                              onClick={() => toggleBranch(name)}
                            >
                              <Checkbox
                                checked={selected.has(name)}
                                onCheckedChange={() => toggleBranch(name)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-mono flex-1 truncate">{name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">on remote</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    onClick={(e) => { e.stopPropagation(); unpromoteBranch(name); }}
                                  >
                                    <Undo2 className="h-3 w-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Move back to kept</TooltipContent>
                              </Tooltip>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Unsafe (collapsible) */}
              {classification.unsafe.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-amber-500/10"
                    onClick={() => setUnsafeOpen(!unsafeOpen)}
                  >
                    {unsafeOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span>Unsafe — Keeping</span>
                    <Badge variant="unsafe" className="ml-1">{classification.unsafe.length}</Badge>
                  </button>
                  {unsafeOpen && (
                    <div className="px-3 pb-3 space-y-0.5">
                      {classification.unsafe.map((result) => (
                        <div
                          key={result.branch}
                          className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-amber-500/10"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-mono truncate">{result.branch}</span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {result.unpushedCommitCount > 0 &&
                              `${result.unpushedCommitCount} unpushed`}
                            {result.unpushedCommitCount > 0 &&
                              result.localOnlyCommitCount > 0 &&
                              ", "}
                            {result.localOnlyCommitCount > 0 &&
                              `${result.localOnlyCommitCount} local-only`}
                            {result.unpushedCommitCount === 0 &&
                              result.localOnlyCommitCount === 0 &&
                              "unmerged work"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Sticky action footer */}
          {(classification.safe.length + promoted.size) > 0 && (
            <div className="flex items-center justify-between border-t px-4 py-3 shrink-0 bg-background">
              <p className="text-xs text-muted-foreground">
                {selected.size} of {classification.safe.length + promoted.size} selected
              </p>
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        selectAllSafe();
                        setConfirmOpen(true);
                      }}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Prune All Safe
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete all branches marked safe</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={selected.size === 0}
                      onClick={() => setConfirmOpen(true)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Prune Selected ({selected.size})
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete selected branches</TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete branches?</DialogTitle>
            <DialogDescription>
              This will permanently delete {selected.size} local branch
              {selected.size === 1 ? "" : "es"}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto rounded-md border p-3">
            <ul className="space-y-1 text-sm font-mono">
              {Array.from(selected).map((branch) => (
                <li key={branch}>{branch}</li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete {selected.size} Branch{selected.size === 1 ? "" : "es"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
