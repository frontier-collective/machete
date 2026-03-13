import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, GitBranch } from "lucide-react";
import { useRepo } from "@/hooks/useRepo";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled source branch (from context menu). Defaults to current branch. */
  defaultSource?: string | null;
  /** All available branch names for the source selector */
  branches: BranchInfo[];
  /** Called after successful creation */
  onCreated?: () => void;
}

const BRANCH_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._\/-]*$/;

export function CreateBranchDialog({
  open,
  onOpenChange,
  defaultSource,
  branches,
  onCreated,
}: CreateBranchDialogProps) {
  const { repoPath, refreshStatus } = useRepo();

  const currentBranch = branches.find((b) => b.current)?.name ?? "HEAD";
  const initialSource = defaultSource ?? currentBranch;

  const [name, setName] = useState("");
  const [source, setSource] = useState(initialSource);
  const [checkout, setCheckout] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setSource(defaultSource ?? currentBranch);
      setCheckout(true);
      setError(null);
    }
  }, [open, defaultSource, currentBranch]);

  const nameError = name.length > 0 && !BRANCH_NAME_REGEX.test(name)
    ? "Invalid branch name. Use letters, numbers, /, -, _, or ."
    : null;

  const canCreate = name.length > 0 && !nameError && !creating;

  async function handleCreate() {
    if (!repoPath || !canCreate) return;
    setCreating(true);
    setError(null);
    try {
      await invoke("create_branch", { repoPath, name, source, checkout });
      refreshStatus();
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Create Branch
          </DialogTitle>
          <DialogDescription>
            Create a new branch from an existing branch or commit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Branch name */}
          <div className="space-y-2">
            <Label htmlFor="branch-name">Branch name</Label>
            <input
              id="branch-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canCreate) handleCreate(); }}
              placeholder="feature/my-branch"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            {nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          {/* Source branch */}
          <div className="space-y-2">
            <Label>Source branch</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.name} value={b.name}>
                    <span className="font-mono text-xs">{b.name}</span>
                    {b.current && <span className="ml-2 text-muted-foreground">(current)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Checkout toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="checkout-new"
              checked={checkout}
              onCheckedChange={(checked) => setCheckout(checked === true)}
            />
            <Label htmlFor="checkout-new" className="text-sm font-normal cursor-pointer">
              Switch to new branch after creation
            </Label>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Branch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
