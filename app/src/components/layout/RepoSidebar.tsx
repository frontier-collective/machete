import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GitBranch,
  Globe,
  Tag,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useRepo } from "@/hooks/useRepo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { BranchInfo, RemoteInfo } from "@/types";

export function RepoSidebar() {
  const { repoPath, setRepoPath, status } = useRepo();

  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [branchesOpen, setBranchesOpen] = useState(true);
  const [remotesOpen, setRemotesOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [expandedRemotes, setExpandedRemotes] = useState<Set<string>>(new Set());

  const fetchSidebarData = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      const [b, r, t] = await Promise.all([
        invoke<BranchInfo[]>("get_branches", { repoPath }),
        invoke<RemoteInfo[]>("get_remotes", { repoPath }),
        invoke<string[]>("get_tags", { repoPath }),
      ]);
      setBranches(b);
      setRemotes(r);
      setTags(t);
    } catch {
      // Silently fail — sidebar is non-critical
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  // Refresh sidebar data when repo changes or status updates (branch might change)
  useEffect(() => {
    fetchSidebarData();
  }, [fetchSidebarData, status?.branch]);

  const handleOpenRepo = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      setRepoPath(selected);
    }
  };

  const toggleRemote = (name: string) => {
    setExpandedRemotes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const repoName = repoPath
    ? repoPath.replace(/\/+$/, "").split("/").pop() || "Repo"
    : null;

  return (
    <aside className="flex h-full w-[220px] flex-col border-r bg-muted/30">
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
              count={branches.length}
              open={branchesOpen}
              onToggle={() => setBranchesOpen(!branchesOpen)}
            />
            {branchesOpen && (
              <div className="ml-2">
                {branches.map((b) => (
                  <div
                    key={b.name}
                    className={`flex items-center gap-2 rounded-sm px-3 py-0.5 text-xs ${
                      b.current
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {b.current && (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                    )}
                    <span className="truncate">{b.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Remotes */}
            <SectionHeader
              icon={Globe}
              label="Remotes"
              count={remotes.length}
              open={remotesOpen}
              onToggle={() => setRemotesOpen(!remotesOpen)}
            />
            {remotesOpen && (
              <div className="ml-2">
                {remotes.map((r) => (
                  <div key={r.name}>
                    <button
                      className="flex w-full items-center gap-1 rounded-sm px-3 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
                      onClick={() => toggleRemote(r.name)}
                    >
                      {expandedRemotes.has(r.name) ? (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      )}
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-auto text-muted-foreground/60">{r.branches.length}</span>
                    </button>
                    {expandedRemotes.has(r.name) && (
                      <div className="ml-5">
                        {r.branches.map((branch) => (
                          <div
                            key={branch}
                            className="truncate rounded-sm px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
                          >
                            {branch.replace(`${r.name}/`, "")}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Tags */}
            <SectionHeader
              icon={Tag}
              label="Tags"
              count={tags.length}
              open={tagsOpen}
              onToggle={() => setTagsOpen(!tagsOpen)}
            />
            {tagsOpen && (
              <div className="ml-2">
                {tags.length === 0 ? (
                  <div className="px-3 py-1 text-xs text-muted-foreground/60">No tags</div>
                ) : (
                  tags.map((tag) => (
                    <div
                      key={tag}
                      className="truncate rounded-sm px-3 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                      {tag}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}

// Section header with collapsible toggle
function SectionHeader({
  icon: Icon,
  label,
  count,
  open,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent/50"
      onClick={onToggle}
    >
      {open ? (
        <ChevronDown className="h-3 w-3 shrink-0" />
      ) : (
        <ChevronRight className="h-3 w-3 shrink-0" />
      )}
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
      <span className="ml-auto font-normal text-muted-foreground/60">{count}</span>
    </button>
  );
}
