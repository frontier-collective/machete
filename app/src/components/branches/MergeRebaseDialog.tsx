import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Loader2,
  GitMerge,
  GitBranch,
  AlertTriangle,
  Check,
  X,
  FileWarning,
  ExternalLink,
} from "lucide-react";
import { useRepoPath, useStatus } from "@/hooks/useRepo";
import type { BranchInfo } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type MergeMode = "merge" | "rebase";
type MergeStrategy = "no-ff" | "ff-only" | "squash";

interface ConflictFile {
  file: string;
  status: string;
  resolved?: boolean;
}

interface MergeRebaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: MergeMode;
  /** Pre-selected branch (from context menu) */
  defaultBranch?: string | null;
  branches: BranchInfo[];
  protectedBranches: string[];
  onCompleted?: () => void;
}

type Phase = "configure" | "conflicts" | "done";

interface MergePreview {
  currentBranch: string;
  sourceBranch: string;
  commitCount: number;
  canFastForward: boolean;
}

export function MergeRebaseDialog({
  open,
  onOpenChange,
  mode,
  defaultBranch,
  branches,
  protectedBranches,
  onCompleted,
}: MergeRebaseDialogProps) {
  const { repoPath } = useRepoPath();
  const { status, refreshStatus } = useStatus();

  const currentBranch = status?.branch ?? "HEAD";

  // Form state
  const [selectedBranch, setSelectedBranch] = useState(defaultBranch || "");
  const [strategy, setStrategy] = useState<MergeStrategy>("no-ff");
  const [phase, setPhase] = useState<Phase>("configure");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Conflict resolution state
  const [conflicts, setConflicts] = useState<ConflictFile[]>([]);
  const [resolvingFile, setResolvingFile] = useState<string | null>(null);
  const [operation, setOperation] = useState<"merge" | "rebase">("merge");

  // Available branches (exclude current)
  const otherBranches = branches.filter((b) => !b.current);

  // Safety checks
  const isProtectedTarget = mode === "merge" && protectedBranches.includes(currentBranch);
  const branchHasRemote = branches.find((b) => b.name === currentBranch)?.hasRemote ?? false;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedBranch(defaultBranch || (otherBranches[0]?.name ?? ""));
      setStrategy("no-ff");
      setPhase("configure");
      setLoading(false);
      setError(null);
      setPreview(null);
      setConflicts([]);
      setOperation(mode);
    }
  }, [open, defaultBranch, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch merge preview when branch selection changes
  useEffect(() => {
    if (!open || !repoPath || !selectedBranch || phase !== "configure") return;
    if (mode !== "merge") {
      // For rebase, count commits to replay
      setPreviewLoading(true);
      invoke<MergePreview>("merge_preview", { repoPath, branch: selectedBranch })
        .then((p) => setPreview(p))
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
      return;
    }
    setPreviewLoading(true);
    invoke<MergePreview>("merge_preview", { repoPath, branch: selectedBranch })
      .then((p) => setPreview(p))
      .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [open, repoPath, selectedBranch, phase, mode]);

  const handleExecute = async () => {
    if (!repoPath || !selectedBranch) return;
    setLoading(true);
    setError(null);

    try {
      if (mode === "merge") {
        const result = await invoke<{
          success: boolean;
          conflicts?: ConflictFile[];
          squash?: boolean;
          message: string;
          operation?: string;
        }>("merge_branch", { repoPath, branch: selectedBranch, strategy });

        if (result.success) {
          refreshStatus();
          if (result.squash) {
            // Squash leaves changes staged — close dialog, user commits in commit view
            setPhase("done");
          } else {
            setPhase("done");
          }
        } else if (result.conflicts && result.conflicts.length > 0) {
          setConflicts(result.conflicts.map((c) => ({ ...c, resolved: false })));
          setOperation("merge");
          setPhase("conflicts");
        }
      } else {
        const result = await invoke<{
          success: boolean;
          conflicts?: ConflictFile[];
          message: string;
          operation?: string;
        }>("rebase_branch", { repoPath, onto: selectedBranch });

        if (result.success) {
          refreshStatus();
          setPhase("done");
        } else if (result.conflicts && result.conflicts.length > 0) {
          setConflicts(result.conflicts.map((c) => ({ ...c, resolved: false })));
          setOperation("rebase");
          setPhase("conflicts");
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (file: string, resolution: "ours" | "theirs" | "manual") => {
    if (!repoPath) return;
    setResolvingFile(file);
    try {
      await invoke("resolve_conflict", { repoPath, file, resolution });
      setConflicts((prev) =>
        prev.map((c) => (c.file === file ? { ...c, resolved: true } : c))
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setResolvingFile(null);
    }
  };

  const refreshConflicts = useCallback(async () => {
    if (!repoPath) return;
    try {
      const files = await invoke<ConflictFile[]>("get_conflict_files", { repoPath });
      // Mark files not in the conflict list as resolved
      setConflicts((prev) =>
        prev.map((c) => ({
          ...c,
          resolved: !files.some((f) => f.file === c.file),
        }))
      );
    } catch {
      // ignore
    }
  }, [repoPath]);

  const handleAbort = async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      await invoke("abort_merge_or_rebase", { repoPath });
      refreshStatus();
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      await invoke("continue_merge_or_rebase", { repoPath });
      refreshStatus();
      setPhase("done");
    } catch (e) {
      // Might have more conflicts
      const msg = String(e);
      if (msg.toLowerCase().includes("conflict")) {
        await refreshConflicts();
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const allResolved = conflicts.length > 0 && conflicts.every((c) => c.resolved);

  const handleClose = () => {
    if (phase === "done") {
      onCompleted?.();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && phase === "conflicts") return; handleClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "merge" ? (
              <GitMerge className="h-5 w-5" />
            ) : (
              <GitBranch className="h-5 w-5" />
            )}
            {phase === "conflicts"
              ? "Resolve Conflicts"
              : phase === "done"
              ? (mode === "merge" ? "Merge Complete" : "Rebase Complete")
              : mode === "merge"
              ? "Merge Branch"
              : "Rebase Branch"}
          </DialogTitle>
          {phase === "configure" && (
            <DialogDescription>
              {mode === "merge"
                ? `Merge a branch into ${currentBranch}.`
                : `Rebase ${currentBranch} onto another branch.`}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* ─── Phase: Configure ─── */}
        {phase === "configure" && (
          <div className="space-y-4 py-2">
            {/* Protected branch warning */}
            {isProtectedTarget && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium text-amber-600 dark:text-amber-400">
                    {currentBranch} is a protected branch
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    Consider using a pull request instead of merging directly.
                  </p>
                </div>
              </div>
            )}

            {/* Dirty working tree warning */}
            {status && !status.isClean && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium text-red-600 dark:text-red-400">
                    Working tree has uncommitted changes
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    Commit or stash your changes before {mode === "merge" ? "merging" : "rebasing"}.
                  </p>
                </div>
              </div>
            )}

            {/* Branch selection */}
            <div className="space-y-2">
              <Label>
                {mode === "merge" ? "Merge" : "Rebase onto"}
              </Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {otherBranches.map((b) => (
                    <SelectItem key={b.name} value={b.name}>
                      <span className="font-mono text-xs">{b.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {mode === "merge"
                  ? <>Merge <span className="font-mono">{selectedBranch || "..."}</span> into <span className="font-mono font-medium">{currentBranch}</span></>
                  : <>Rebase <span className="font-mono font-medium">{currentBranch}</span> onto <span className="font-mono">{selectedBranch || "..."}</span></>}
              </p>
            </div>

            {/* Merge strategy (merge mode only) */}
            {mode === "merge" && (
              <div className="space-y-2">
                <Label>Strategy</Label>
                <div className="space-y-2">
                  {([
                    ["no-ff", "Merge commit", "Creates a merge commit preserving full branch history"],
                    ["ff-only", "Fast-forward only", "Linear history — fails if not possible"],
                    ["squash", "Squash", "Collapse all commits into one staged changeset"],
                  ] as const).map(([value, label, desc]) => (
                    <label
                      key={value}
                      className={`flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                        strategy === value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="strategy"
                        value={value}
                        checked={strategy === value}
                        onChange={() => setStrategy(value)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Rebase warning */}
            {mode === "rebase" && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium text-amber-600 dark:text-amber-400">
                    Rebase rewrites commit history
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    Do not rebase branches that have been pushed and shared with others.
                    {branchHasRemote && (
                      <span className="block mt-1 font-medium text-amber-600 dark:text-amber-400">
                        This branch has a remote tracking branch — rebasing will require a force push.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Preview */}
            {preview && selectedBranch && (
              <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                <p>
                  {preview.commitCount === 0
                    ? "Already up to date — nothing to merge."
                    : mode === "merge"
                    ? `${preview.commitCount} commit${preview.commitCount > 1 ? "s" : ""} will be merged`
                    : `${preview.commitCount} commit${preview.commitCount > 1 ? "s" : ""} will be replayed`}
                </p>
                {mode === "merge" && preview.canFastForward && strategy !== "ff-only" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Fast-forward is possible for this merge.
                  </p>
                )}
              </div>
            )}
            {previewLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading preview...
              </div>
            )}

            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>
        )}

        {/* ─── Phase: Conflict Resolution ─── */}
        {phase === "conflicts" && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <FileWarning className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  {operation === "merge" ? "Merge" : "Rebase"} paused — resolve conflicts to continue
                </p>
                <p className="text-muted-foreground mt-0.5">
                  {conflicts.filter((c) => c.resolved).length} of {conflicts.length} resolved
                </p>
              </div>
            </div>

            {/* Conflict file list */}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {conflicts.map((c) => (
                <div
                  key={c.file}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    c.resolved ? "border-green-500/30 bg-green-500/5" : "border-border"
                  }`}
                >
                  {c.resolved ? (
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <X className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  <span className="flex-1 font-mono text-xs truncate">{c.file}</span>
                  {!c.resolved && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2"
                        disabled={resolvingFile === c.file}
                        onClick={() => handleResolve(c.file, "ours")}
                      >
                        Ours
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2"
                        disabled={resolvingFile === c.file}
                        onClick={() => handleResolve(c.file, "theirs")}
                      >
                        Theirs
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2"
                        disabled={resolvingFile === c.file}
                        onClick={() => handleResolve(c.file, "manual")}
                        title="Mark as manually resolved (stages the file)"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      {resolvingFile === c.file && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>
        )}

        {/* ─── Phase: Done ─── */}
        {phase === "done" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <p className="text-sm font-medium">
              {mode === "merge" ? "Merge" : "Rebase"} completed successfully
            </p>
            {mode === "merge" && strategy === "squash" && (
              <p className="text-xs text-muted-foreground text-center">
                Changes have been staged. Go to the Commit view to create a commit.
              </p>
            )}
          </div>
        )}

        {/* ─── Footer ─── */}
        <DialogFooter>
          {phase === "configure" && (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={handleExecute}
                disabled={
                  loading ||
                  !selectedBranch ||
                  (status && !status.isClean) ||
                  (preview?.commitCount === 0)
                }
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "merge" ? "Merge" : "Rebase"}
              </Button>
            </>
          )}
          {phase === "conflicts" && (
            <>
              <Button variant="destructive" onClick={handleAbort} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Abort {operation === "merge" ? "Merge" : "Rebase"}
              </Button>
              <Button onClick={handleContinue} disabled={loading || !allResolved}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue {operation === "merge" ? "Merge" : "Rebase"}
              </Button>
            </>
          )}
          {phase === "done" && (
            <Button onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
