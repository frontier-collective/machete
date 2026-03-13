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
} from "lucide-react";
import { useRepo } from "@/hooks/useRepo";
import type { PruneClassification, BranchSafetyResult } from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function BranchesView() {
  const { repoPath } = useRepo();

  const [classification, setClassification] = useState<PruneClassification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

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

  if (!repoPath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Open a repository to get started.
      </div>
    );
  }

  if (!classification && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <GitBranch className="h-12 w-12" />
        <p>Scan your branches to see which are safe to prune.</p>
        <Button onClick={fetchClassification}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Fetch &amp; Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Branch Management</h2>
          {classification && (
            <p className="text-sm text-muted-foreground">
              Current branch: <span className="font-medium text-foreground">{classification.currentBranch}</span>
            </p>
          )}
        </div>
        <Button variant="outline" onClick={fetchClassification} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Fetch &amp; Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {deleteResult && (
        <Card className="border-green-500/50">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {deleteResult}
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Scanning branches...
        </div>
      )}

      {classification && !loading && (
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 pr-4">
            {/* Protected Branches */}
            {classification.protected.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Shield className="h-4 w-4 text-blue-500" />
                    Protected
                    <Badge variant="protected" className="ml-auto">
                      {classification.protected.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {classification.protected.map((branch) => (
                    <div
                      key={branch}
                      className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono">{branch}</span>
                      </div>
                      <Badge variant="protected">protected</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Kept Branches */}
            {classification.kept.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <GitBranch className="h-4 w-4" />
                    Local Branches
                    <Badge variant="secondary" className="ml-auto">
                      {classification.kept.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {classification.kept.map(({ name, reason }) => (
                    <div
                      key={name}
                      className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono">{name}</span>
                      </div>
                      <Badge variant="secondary">{reason}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* Safe to Delete */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Safe to Delete
                    <Badge variant="safe" className="ml-2">
                      {classification.safe.length}
                    </Badge>
                  </CardTitle>
                  {classification.safe.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={selectAllSafe}>
                      Select All
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {classification.safe.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    No branches are safe to delete.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {classification.safe.map((result) => {
                      const target = mergeTarget(result);
                      return (
                        <div
                          key={result.branch}
                          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selected.has(result.branch)}
                            onCheckedChange={() => toggleBranch(result.branch)}
                          />
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono flex-1">{result.branch}</span>
                          <div className="flex items-center gap-2">
                            {target && (
                              <span className="text-xs text-muted-foreground">
                                merged &rarr; {target}
                              </span>
                            )}
                            <Badge variant="safe">safe</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Unsafe Branches */}
            {classification.unsafe.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Unsafe (Keeping)
                    <Badge variant="unsafe" className="ml-2">
                      {classification.unsafe.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {classification.unsafe.map((result) => (
                    <div
                      key={result.branch}
                      className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono">{result.branch}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
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
                        <Badge variant="unsafe">unsafe</Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Action bar */}
      {classification && !loading && classification.safe.length > 0 && (
        <>
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selected.size} of {classification.safe.length} branch
              {classification.safe.length === 1 ? "" : "es"} selected
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  selectAllSafe();
                  setConfirmOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Prune All Safe
              </Button>
              <Button
                variant="destructive"
                disabled={selected.size === 0}
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Prune Selected ({selected.size})
              </Button>
            </div>
          </div>
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
