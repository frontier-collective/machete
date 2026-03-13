import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
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
} from "lucide-react";
import { useRepoPath } from "@/hooks/useRepo";
import type { PruneClassification, BranchSafetyResult } from "@/types";
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

export function BranchesView() {
  const { repoPath } = useRepoPath();

  const [classification, setClassification] = useState<PruneClassification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  // Collapsible sections
  const [keptOpen, setKeptOpen] = useState(false);
  const [unsafeOpen, setUnsafeOpen] = useState(false);

  const fetchClassification = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    setDeleteResult(null);
    try {
      const result = await invoke<PruneClassification>("get_branch_classification", {
        repoPath,
      });
      setClassification(result);
      setSelected(new Set());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

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
    setSelected(new Set(classification.safe.map((b) => b.branch)));
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
      await fetchClassification();
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
      <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
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
        <Button onClick={fetchClassification} className="mt-2">
          <RefreshCw className="mr-2 h-4 w-4" />
          Scan Branches
        </Button>
      </div>
    );
  }

  // ─── Post-scan results ─────────────────────────────────────────────

  const keptCount = (classification?.protected.length ?? 0) + (classification?.kept.length ?? 0);

  return (
    <div className="flex h-full flex-col">
      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Scanning branches...
        </div>
      )}

      {classification && !loading && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Summary:</span>
            {classification.protected.length > 0 && (
              <Badge variant="protected">{classification.protected.length} protected</Badge>
            )}
            {classification.kept.length > 0 && (
              <Badge variant="secondary">{classification.kept.length} kept</Badge>
            )}
            <Badge variant="safe">{classification.safe.length} safe to delete</Badge>
            {classification.unsafe.length > 0 && (
              <Badge variant="unsafe">{classification.unsafe.length} unsafe</Badge>
            )}
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={fetchClassification}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
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
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-4 py-3 space-y-4">
              {/* Kept Branches (collapsible) */}
              {keptCount > 0 && (
                <div>
                  <button
                    className="flex w-full items-center gap-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    onClick={() => setKeptOpen(!keptOpen)}
                  >
                    {keptOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Kept Branches
                    <Badge variant="secondary" className="ml-1">{keptCount}</Badge>
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
                      {classification.kept.map(({ name, reason }) => (
                        <div
                          key={name}
                          className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-mono truncate">{name}</span>
                          </div>
                          <Badge variant="secondary">{reason}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Safe to Delete (primary focus) */}
              <div className="rounded-lg border border-green-500/30 bg-green-500/5">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-semibold">Safe to Delete</span>
                    <Badge variant="safe">{classification.safe.length}</Badge>
                  </div>
                  {classification.safe.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={selectAllSafe}>
                      Select All
                    </Button>
                  )}
                </div>
                <div className="px-3 pb-3">
                  {classification.safe.length === 0 ? (
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
                            className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm hover:bg-green-500/10 cursor-pointer"
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
                    </div>
                  )}
                </div>
              </div>

              {/* Unsafe (collapsible) */}
              {classification.unsafe.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5">
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
          {classification.safe.length > 0 && (
            <div className="flex items-center justify-between border-t px-4 py-3 shrink-0 bg-background">
              <p className="text-xs text-muted-foreground">
                {selected.size} of {classification.safe.length} selected
              </p>
              <div className="flex gap-2">
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
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={selected.size === 0}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Prune Selected ({selected.size})
                </Button>
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
  );
}
