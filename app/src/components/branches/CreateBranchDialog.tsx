import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, GitBranch } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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

type BranchType = "feature" | "bugfix" | "hotfix" | "other";

function toKebabCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CreateBranchDialog({
  open,
  onOpenChange,
  defaultSource,
  branches,
  onCreated,
}: CreateBranchDialogProps) {
  const { repoPath } = useRepoPath();
  const { refreshStatus } = useStatus();

  const currentBranch = branches.find((b) => b.current)?.name ?? "HEAD";
  const hasMain = branches.some((b) => b.name === "main");
  const hasMaster = branches.some((b) => b.name === "master");

  /** Resolve the default source branch for a given branch type. */
  function defaultSourceFor(type: BranchType): string {
    if (defaultSource) return defaultSource;
    if (type === "hotfix") {
      // Hotfixes branch from main/master
      if (hasMain) return "main";
      if (hasMaster) return "master";
    }
    // feature, bugfix, other → current branch
    return currentBranch;
  }

  // Form state
  const [branchType, setBranchType] = useState<BranchType>("feature");
  const [storyId, setStoryId] = useState("");
  const [description, setDescription] = useState("");
  const [freeFormName, setFreeFormName] = useState("");
  const [freeForm, setFreeForm] = useState(false);
  const [source, setSource] = useState(defaultSourceFor("feature"));
  const [checkout, setCheckout] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextStoryId, setNextStoryId] = useState<string | null>(null);

  // Update source branch when branch type changes (unless user picked via context menu)
  useEffect(() => {
    if (!defaultSource) {
      setSource(defaultSourceFor(branchType));
    }
  }, [branchType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setBranchType("feature");
      setStoryId("");
      setDescription("");
      setFreeFormName("");
      setFreeForm(false);
      setSource(defaultSourceFor("feature"));
      setCheckout(true);
      setError(null);
      // Fetch next story ID suggestion
      if (repoPath) {
        invoke<string>("get_next_story_id", { repoPath })
          .then((id) => setNextStoryId(id))
          .catch(() => setNextStoryId(null));
      }
    }
  }, [open, defaultSource, currentBranch, repoPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build the assembled branch name
  const assembledName = useMemo(() => {
    if (freeForm) return freeFormName;
    if (branchType === "other") {
      return description ? toKebabCase(description) : "";
    }
    const parts: string[] = [branchType];
    const suffix: string[] = [];
    if (storyId.trim()) {
      const num = storyId.trim().replace(/^MACH-?/i, "");
      if (num) suffix.push(`MACH-${num.padStart(4, "0")}`);
    }
    const kebab = toKebabCase(description);
    if (kebab) suffix.push(kebab);
    if (suffix.length === 0) return "";
    return `${parts.join("/")}/${suffix.join("-")}`;
  }, [freeForm, freeFormName, branchType, storyId, description]);

  const nameError = useMemo(() => {
    if (!assembledName) return null;
    if (!BRANCH_NAME_REGEX.test(assembledName)) {
      return "Invalid branch name. Use letters, numbers, /, -, _, or .";
    }
    if (branches.some((b) => b.name === assembledName)) {
      return "A branch with this name already exists.";
    }
    return null;
  }, [assembledName, branches]);

  const canCreate = assembledName.length > 0 && !nameError && !creating;

  async function handleCreate() {
    if (!repoPath || !canCreate) return;
    setCreating(true);
    setError(null);
    try {
      await invoke("create_branch", { repoPath, name: assembledName, source, checkout });
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Create Branch
          </DialogTitle>
          <DialogDescription>
            Create a new branch with naming conventions or a free-form name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Free-form toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="free-form"
              checked={freeForm}
              onCheckedChange={(checked) => setFreeForm(checked === true)}
            />
            <Label htmlFor="free-form" className="text-sm font-normal cursor-pointer">
              Free-form name
            </Label>
          </div>

          {freeForm ? (
            /* Free-form: single name input */
            <div className="space-y-2">
              <Label htmlFor="branch-name">Branch name</Label>
              <Input
                id="branch-name"
                type="text"
                autoFocus
                value={freeFormName}
                onChange={(e) => setFreeFormName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canCreate) handleCreate(); }}
                placeholder="feature/my-branch"
              />
            </div>
          ) : (
            <>
              {/* Branch type */}
              <div className="space-y-2">
                <Label>Branch type</Label>
                <Select value={branchType} onValueChange={(v) => setBranchType(v as BranchType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feature">feature</SelectItem>
                    <SelectItem value="bugfix">bugfix</SelectItem>
                    <SelectItem value="hotfix">hotfix</SelectItem>
                    <SelectItem value="other">other (no prefix)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Story ID (not shown for "other") */}
              {branchType !== "other" && (
                <div className="space-y-2">
                  <Label htmlFor="story-id">
                    Story ID{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground font-mono">MACH-</span>
                    <Input
                      id="story-id"
                      type="text"
                      value={storyId}
                      onChange={(e) => setStoryId(e.target.value.replace(/[^0-9]/g, ""))}
                      onKeyDown={(e) => { if (e.key === "Enter" && canCreate) handleCreate(); }}
                      placeholder={nextStoryId?.replace("MACH-", "") ?? "0001"}
                      className="w-20 font-mono"
                    />
                    {nextStoryId && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                        onClick={() => setStoryId(nextStoryId.replace("MACH-", ""))}
                      >
                        Use {nextStoryId}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="branch-desc">Description</Label>
                <Input
                  id="branch-desc"
                  type="text"
                  autoFocus
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canCreate) handleCreate(); }}
                  placeholder="my feature name"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-converted to kebab-case
                </p>
              </div>
            </>
          )}

          {/* Preview */}
          {assembledName && (
            <div className="rounded-md border bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground mb-1">Preview</p>
              <p className={`text-sm font-mono ${nameError ? "text-destructive" : ""}`}>
                {assembledName}
              </p>
            </div>
          )}

          {nameError && (
            <p className="text-xs text-destructive">{nameError}</p>
          )}

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
