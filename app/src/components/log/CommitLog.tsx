import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useRepo } from "@/hooks/useRepo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { CommitLogEntry } from "@/types";

export function CommitLog() {
  const { repoPath, status } = useRepo();
  const [commits, setCommits] = useState<CommitLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const hasLoaded = useRef(false);

  const fetchLog = useCallback(async () => {
    if (!repoPath) return;
    if (!hasLoaded.current) setLoading(true);
    try {
      const result = await invoke<CommitLogEntry[]>("get_commit_log", {
        repoPath,
        count: 100,
      });
      setCommits(result);
    } catch {
      // Non-critical — leave empty
    } finally {
      hasLoaded.current = true;
      setLoading(false);
    }
  }, [repoPath]);

  // Refresh log when status changes (new commit, branch switch, etc.)
  useEffect(() => {
    fetchLog();
  }, [fetchLog, status?.branch]);

  if (!repoPath) return null;

  if (loading && commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No commits
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b text-muted-foreground">
            <th className="text-left font-medium px-3 py-1.5 w-[4.5rem]">Hash</th>
            <th className="text-left font-medium px-3 py-1.5">Message</th>
            <th className="text-left font-medium px-3 py-1.5 w-[8rem]">Author</th>
            <th className="text-left font-medium px-3 py-1.5 w-[7rem]">Date</th>
          </tr>
        </thead>
        <tbody>
          {commits.map((commit) => (
            <tr
              key={commit.hash}
              className="border-b border-border/40 hover:bg-accent/50"
            >
              <td className="px-3 py-1 font-mono text-muted-foreground">
                {commit.shortHash}
              </td>
              <td className="px-3 py-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {commit.refs.length > 0 && (
                    <span className="flex gap-1 shrink-0">
                      {commit.refs.map((ref_) => (
                        <RefBadge key={ref_} refName={ref_} />
                      ))}
                    </span>
                  )}
                  <span className="truncate">{commit.message}</span>
                </div>
              </td>
              <td className="px-3 py-1 text-muted-foreground truncate">
                {commit.author}
              </td>
              <td className="px-3 py-1 text-muted-foreground whitespace-nowrap">
                {formatDate(commit.date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function RefBadge({ refName }: { refName: string }) {
  // Determine badge style based on ref type
  if (refName.startsWith("HEAD -> ")) {
    const branch = refName.replace("HEAD -> ", "");
    return (
      <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 font-mono">
        {branch}
      </Badge>
    );
  }
  if (refName.startsWith("tag: ")) {
    const tag = refName.replace("tag: ", "");
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono border-amber-500/50 text-amber-600 dark:text-amber-400">
        {tag}
      </Badge>
    );
  }
  if (refName.includes("/")) {
    // Remote branch
    return (
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-mono">
        {refName}
      </Badge>
    );
  }
  // Local branch
  return (
    <Badge variant="safe" className="text-[10px] px-1.5 py-0 h-4 font-mono">
      {refName}
    </Badge>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return iso;
  }
}
