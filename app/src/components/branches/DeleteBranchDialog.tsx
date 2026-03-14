import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { Loader2, AlertTriangle, Shield, Check, GitBranch, CloudOff, ArrowUp } from "lucide-react";
import { useRepoPath, useStatus, useClassification } from "@/hooks/useRepo";
import type { BranchSafetyResult, BranchInfo } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface DeleteBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The branch to delete */
  branch: string | null;
  /** BranchInfo with ahead/behind/hasRemote from the sidebar */
  branchInfo?: BranchInfo | null;
  /** Called after successful deletion */
  onDeleted?: () => void;
}

/**
 * Safety assessment that considers both classification data AND the
 * local-vs-remote relationship, and reacts to the "delete remote" toggle.
 *
 * A branch is safe to delete when ANY of these is true:
 * 1. Classification says "safe" (merged into another branch)
 * 2. Local is at or behind remote (ahead === 0, hasRemote) AND user
 *    is NOT deleting the remote — all work is safely on the remote
 *
 * A branch is unsafe when:
 * - Classification says "unsafe" AND none of the safe conditions apply
 * - OR the user checked "delete remote" and the branch isn't merged
 */
type SafetyLevel = "safe" | "unsafe" | "protected" | "loading";

interface SafetyAssessment {
  level: SafetyLevel;
  /** Classification result if available */
  classResult: BranchSafetyResult | null;
  /** Whether safety comes from all-pushed-to-remote (not from merge status) */
  safeViaRemote: boolean;
  /** Whether the branch is merged into another branch */
  isMerged: boolean;
  /** Human-readable reasons the branch is safe */
  safeReasons: string[];
  /** Human-readable risks */
  risks: string[];
}

export function DeleteBranchDialog({
  open,
  onOpenChange,
  branch,
  branchInfo,
  onDeleted,
}: DeleteBranchDialogProps) {
  const { repoPath } = useRepoPath();
  const { refreshStatus } = useStatus();
  const { classification, fetchClassification } = useClassification();

  const [deleting, setDeleting] = useState(false);
  const [deleteRemote, setDeleteRemote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // When the dialog opens, ensure we have classification data
  useEffect(() => {
    if (!open || !branch) return;
    setError(null);
    setDeleting(false);
    setDeleteRemote(false);

    if (!classification) {
      setChecking(true);
      fetchClassification().finally(() => setChecking(false));
    }
  }, [open, branch, classification, fetchClassification]);

  // Compute safety — reactive to deleteRemote toggle
  //
  // Classification buckets from `machete prune --dry-run`:
  //   safe     — merged into another branch (safe to auto-prune)
  //   unsafe   — has unmerged/unpushed work (dangerous to auto-prune)
  //   kept     — on remote but not obviously merged (conservative: kept for auto-prune)
  //   protected — protected branch
  //
  // For an explicit user-initiated delete, we can be smarter:
  //   - "kept" branches are NOT dangerous — they just aren't auto-prunable
  //   - If all commits are pushed to remote, the work is preserved
  //   - Only branches explicitly in "unsafe" have real risks
  const safety: SafetyAssessment = useMemo(() => {
    if (!branch || !classification) {
      return { level: "loading", classResult: null, safeViaRemote: false, isMerged: false, safeReasons: [], risks: [] };
    }

    // Protected?
    if (classification.protected.includes(branch)) {
      return { level: "protected", classResult: null, safeViaRemote: false, isMerged: false, safeReasons: [], risks: [] };
    }

    const safeResult = classification.safe.find((b) => b.branch === branch) ?? null;
    const unsafeResult = classification.unsafe.find((b) => b.branch === branch) ?? null;
    const classResult = safeResult ?? unsafeResult;
    const isKept = !safeResult && !unsafeResult; // in "kept" list or not classified at all

    const isMerged = safeResult !== null;
    const isClassifiedUnsafe = unsafeResult !== null;
    const hasRemote = branchInfo?.hasRemote ?? classResult?.onRemote ?? false;
    const aheadCount = branchInfo?.ahead ?? classResult?.unpushedCommitCount ?? 0;
    const allPushed = hasRemote && aheadCount === 0;

    const safeReasons: string[] = [];
    const risks: string[] = [];

    // Build safe reasons
    if (isMerged && safeResult) {
      if (safeResult.mergedInto.length > 0) {
        safeReasons.push(`Merged into ${safeResult.mergedInto.join(", ")}`);
      }
      if (safeResult.squashMergedInto.length > 0) {
        safeReasons.push(`Squash-merged into ${safeResult.squashMergedInto.join(", ")}`);
      }
    }

    if (allPushed) {
      safeReasons.push("All commits pushed to remote");
    }

    if (isKept && hasRemote && !allPushed) {
      // Kept branch with remote but some commits ahead — still relatively safe
      safeReasons.push("Branch exists on remote");
    }

    // Build risks (only for branches explicitly classified as unsafe)
    if (isClassifiedUnsafe && unsafeResult) {
      if (unsafeResult.unpushedCommitCount > 0) {
        risks.push(`${unsafeResult.unpushedCommitCount} unpushed commit${unsafeResult.unpushedCommitCount !== 1 ? "s" : ""}`);
      }
      if (unsafeResult.localOnlyCommitCount > 0) {
        risks.push(`${unsafeResult.localOnlyCommitCount} local-only commit${unsafeResult.localOnlyCommitCount !== 1 ? "s" : ""}`);
      }
      if (!unsafeResult.onRemote) {
        risks.push("No remote tracking branch — local only");
      }
      if (unsafeResult.mergedInto.length === 0 && unsafeResult.squashMergedInto.length === 0) {
        risks.push("Not merged into any branch");
      }
    }

    // Determine effective safety level:
    //
    // 1. Classification says "safe" (merged) → always safe, even deleting remote
    if (isMerged) {
      return { level: "safe", classResult, safeViaRemote: false, isMerged, safeReasons, risks };
    }

    // 2. "kept" or not classified — these aren't dangerous, just not auto-prunable
    //    Safe to delete locally (and remote too, since the work is on other branches
    //    or the user is explicitly choosing to delete)
    if (isKept) {
      return { level: "safe", classResult, safeViaRemote: allPushed, isMerged, safeReasons, risks };
    }

    // 3. Classified "unsafe" — has real risks
    //    Still safe if all pushed AND not deleting remote (work preserved on remote)
    if (allPushed && !deleteRemote) {
      return { level: "safe", classResult, safeViaRemote: true, isMerged, safeReasons, risks };
    }

    return { level: "unsafe", classResult, safeViaRemote: false, isMerged, safeReasons, risks };
  }, [branch, classification, branchInfo, deleteRemote]);

  const handleDelete = async () => {
    if (!repoPath || !branch) return;
    setDeleting(true);
    setError(null);

    const force = safety.level === "unsafe";

    try {
      await invoke("delete_branch", {
        repoPath,
        branch,
        force,
        deleteRemote,
      });
      onOpenChange(false);
      refreshStatus();
      emit("remote-fetched"); // refresh sidebar + commit log
      onDeleted?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  };

  if (!branch) return null;

  const { level } = safety;
  const isLoading = level === "loading" || checking;
  const hasRemote = branchInfo?.hasRemote ?? safety.classResult?.onRemote ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isLoading ? (
              <GitBranch className="h-4 w-4 text-muted-foreground" />
            ) : level === "safe" ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : level === "protected" ? (
              <Shield className="h-4 w-4 text-blue-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            Delete branch
          </DialogTitle>
          <DialogDescription>
            {isLoading ? (
              "Checking branch safety..."
            ) : level === "protected" ? (
              <>
                <span className="font-semibold text-foreground">{branch}</span> is a protected branch and cannot be deleted.
              </>
            ) : level === "safe" ? (
              <>
                <span className="font-semibold text-foreground">{branch}</span> is safe to delete.
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">{branch}</span> may have unmerged changes. Are you sure?
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Safety details — shown for both safe and unsafe */}
        {!isLoading && level !== "protected" && (
          <div className={`rounded-md border p-3 text-sm space-y-2 ${
            level === "safe"
              ? "bg-green-500/5 border-green-500/20"
              : "bg-amber-500/5 border-amber-500/30"
          }`}>
            {/* Safe reasons */}
            {safety.safeReasons.length > 0 && (
              <div className="space-y-0.5">
                {safety.safeReasons.map((reason) => (
                  <p key={reason} className="flex items-center gap-1.5 text-muted-foreground">
                    <Check className="h-3 w-3 text-green-500 shrink-0" />
                    {reason}
                  </p>
                ))}
              </div>
            )}

            {/* Risks */}
            {safety.risks.length > 0 && level === "unsafe" && (
              <div className="space-y-0.5">
                {safety.risks.map((risk) => (
                  <p key={risk} className="flex items-center gap-1.5 text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                    {risk}
                  </p>
                ))}
              </div>
            )}

            {/* Contextual note about remote preservation */}
            {safety.safeViaRemote && !deleteRemote && (
              <p className="text-xs text-muted-foreground pt-0.5">
                The remote branch will be preserved. Your work is safe.
              </p>
            )}

            {/* Force delete warning */}
            {level === "unsafe" && (
              <p className="text-xs text-muted-foreground pt-0.5">
                This will use force delete (<code className="text-[11px] bg-muted px-1 rounded">git branch -D</code>).
              </p>
            )}
          </div>
        )}

        {/* Delete remote checkbox */}
        {!isLoading && level !== "protected" && hasRemote && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Checkbox
                id="delete-remote"
                checked={deleteRemote}
                onCheckedChange={(checked) => setDeleteRemote(!!checked)}
                disabled={deleting}
              />
              <Label htmlFor="delete-remote" className="text-sm cursor-pointer">
                Also delete the remote branch
              </Label>
            </div>
            {/* Warning when toggling delete-remote makes it unsafe */}
            {deleteRemote && safety.safeViaRemote && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 pl-6">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                This branch is not merged. Deleting the remote will remove the only remaining copy.
              </p>
            )}
          </div>
        )}

        {/* Show remote info for branches without remote */}
        {!isLoading && level !== "protected" && !hasRemote && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CloudOff className="h-3 w-3 shrink-0" />
            This branch has no remote tracking branch
          </p>
        )}

        {/* Ahead indicator when relevant */}
        {!isLoading && level !== "protected" && hasRemote && branchInfo && branchInfo.ahead > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUp className="h-3 w-3 shrink-0" />
            {branchInfo.ahead} commit{branchInfo.ahead !== 1 ? "s" : ""} ahead of remote
          </p>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          {level !== "protected" && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || isLoading}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Deleting...
                </>
              ) : level === "unsafe" ? (
                "Force Delete"
              ) : (
                "Delete"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
