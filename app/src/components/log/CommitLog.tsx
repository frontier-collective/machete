import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useRepo } from "@/hooks/useRepo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { CommitLogEntry } from "@/types";
import { computeGraphLayout, type CommitGraphRow } from "./graphLayout";
import { GraphColumn, LANE_WIDTH, ROW_HEIGHT, UNCOMMITTED_COLOR, laneColor } from "./GraphColumn";

export function CommitLog() {
  const { repoPath, status, selectedBranch, selectedCommitHash, setSelectedCommitHash } = useRepo();
  const [commits, setCommits] = useState<CommitLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const hasLoaded = useRef(false);

  const fetchLog = useCallback(async () => {
    if (!repoPath) return;
    if (!hasLoaded.current) setLoading(true);
    try {
      const result = await invoke<CommitLogEntry[]>("get_commit_log", {
        repoPath,
        count: 200,
      });
      setCommits(result);
    } catch {
      // Non-critical — leave empty
    } finally {
      hasLoaded.current = true;
      setLoading(false);
    }
  }, [repoPath]);

  // Refresh log when status changes (new commit, branch switch, staged count change, etc.)
  useEffect(() => {
    fetchLog();
  }, [fetchLog, status]);

  // Compute graph layout from commits
  const baseGraphRows = useMemo(() => computeGraphLayout(commits), [commits]);

  // Determine if there are uncommitted changes
  const hasUncommitted = status && !status.isClean;

  // Find the HEAD commit index — the one with "HEAD -> branch" in its refs
  const headCommitIndex = useMemo(() => {
    for (let i = 0; i < commits.length; i++) {
      if (commits[i].refs.some((r) => r.startsWith("HEAD -> "))) return i;
    }
    return 0; // fallback to first
  }, [commits]);

  // When there are uncommitted changes, shift the entire graph right by one lane
  // to reserve lane 0 for the grey uncommitted→HEAD line
  const graphRows: CommitGraphRow[] = useMemo(() => {
    if (!hasUncommitted) return baseGraphRows;
    return baseGraphRows.map((row) => ({
      ...row,
      lane: row.lane + 1,
      segments: row.segments.map((s) => ({
        ...s,
        fromLane: s.fromLane + 1,
        toLane: s.toLane + 1,
      })),
      maxLane: row.maxLane + 1,
    }));
  }, [baseGraphRows, hasUncommitted]);

  const globalMaxLane = useMemo(
    () => graphRows.reduce((max, r) => Math.max(max, r.maxLane), 0),
    [graphRows]
  );
  const graphColWidth = (globalMaxLane + 1) * LANE_WIDTH + 8;

  // Ref map for scrolling to highlighted rows
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // Find which commit hash to highlight based on selected branch/tag
  const highlightHash = useMemo(() => {
    if (!selectedBranch || commits.length === 0) return null;

    // Tag selection: selectedBranch is "tag:v1.0.0", match ref "tag: v1.0.0"
    if (selectedBranch.startsWith("tag:")) {
      const tagName = selectedBranch.slice(4);
      for (const c of commits) {
        for (const ref of c.refs) {
          if (ref === `tag: ${tagName}`) return c.hash;
        }
      }
      return null;
    }

    // Branch selection: local or remote
    for (const c of commits) {
      for (const ref of c.refs) {
        if (ref === selectedBranch) return c.hash;
        if (ref === `HEAD -> ${selectedBranch}`) return c.hash;
      }
    }
    return null;
  }, [selectedBranch, commits]);

  // When sidebar selection changes, sync selectedCommitHash and scroll into view
  useEffect(() => {
    if (!highlightHash) return;
    // Update selected commit to match, clearing any previous row selection
    setSelectedCommitHash(highlightHash);
    const row = rowRefs.current.get(highlightHash);
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [highlightHash, setSelectedCommitHash]);

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
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b text-muted-foreground" style={{ height: ROW_HEIGHT }}>
            <th className="text-left font-medium px-1 py-0" style={{ width: graphColWidth }} />
            <th className="text-left font-medium px-2 py-0 w-[4.5rem]">Hash</th>
            <th className="text-left font-medium px-2 py-0">Message</th>
            <th className="text-left font-medium px-2 py-0 w-[7rem]">Author</th>
            <th className="text-left font-medium px-2 py-0 w-[5.5rem]">Date</th>
          </tr>
        </thead>
        <tbody>
          {/* Uncommitted changes row — always at the top */}
          {hasUncommitted && graphRows.length > 0 && (
            <tr
              className={`cursor-pointer ${
                selectedCommitHash === null
                  ? "bg-amber-500/10 hover:bg-amber-500/15"
                  : "bg-amber-500/5 hover:bg-amber-500/10"
              }`}
              style={{ height: ROW_HEIGHT }}
              onClick={() => setSelectedCommitHash(null)}
            >
              <td className="p-0 align-middle border-0" style={{ width: graphColWidth }}>
                <UncommittedGraphCell globalMaxLane={globalMaxLane} />
              </td>
              <td className="px-2 py-0 font-mono text-muted-foreground align-middle border-b border-border/40">
                •
              </td>
              <td className="px-2 py-0 align-middle border-b border-border/40">
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Uncommitted changes
                </span>
              </td>
              <td className="px-2 py-0 text-muted-foreground align-middle border-b border-border/40">
                •
              </td>
              <td className="px-2 py-0 text-muted-foreground align-middle border-b border-border/40">
                •
              </td>
            </tr>
          )}

          {commits.map((commit, i) => {
            const isHighlighted = commit.hash === highlightHash;
            const isSelected = commit.hash === selectedCommitHash;
            const isHeadCommit = i === headCommitIndex;
            const graphRow = graphRows[i];

            // Uncommitted line logic: grey line at lane 0 from top to HEAD
            // Rows before HEAD: pass-through at lane 0
            // HEAD row: curve from lane 0 to the commit's lane
            const showUncommittedPassThrough = !!(hasUncommitted && i < headCommitIndex);
            const showUncommittedCurve = !!(hasUncommitted && isHeadCommit);

            return (
              <tr
                key={commit.hash}
                ref={(el) => {
                  if (el) rowRefs.current.set(commit.hash, el);
                  else rowRefs.current.delete(commit.hash);
                }}
                className={`cursor-pointer ${
                  isSelected
                    ? "bg-primary/15 hover:bg-primary/20"
                    : isHighlighted
                      ? "bg-primary/10 hover:bg-primary/15"
                      : "hover:bg-accent/50"
                }`}
                style={{ height: ROW_HEIGHT }}
                onClick={() => setSelectedCommitHash(commit.hash)}
              >
                {/* Graph column — no border so lines are seamless */}
                <td className="p-0 align-middle border-0" style={{ width: graphColWidth }}>
                  <GraphColumn
                    row={graphRow}
                    globalMaxLane={globalMaxLane}
                    uncommittedPassThrough={showUncommittedPassThrough}
                    uncommittedCurveToHead={showUncommittedCurve}
                  />
                </td>
                <td className="px-2 py-0 font-mono text-muted-foreground align-middle border-b border-border/40">
                  {commit.shortHash}
                </td>
                <td className="px-2 py-0 align-middle border-b border-border/40">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {commit.refs.length > 0 && (
                      <span className="flex gap-1 shrink-0">
                        {commit.refs.map((ref_) => (
                          <RefBadge key={ref_} refName={ref_} laneColor={laneColor(graphRow.color)} />
                        ))}
                      </span>
                    )}
                    <span className="truncate">{commit.message}</span>
                  </div>
                </td>
                <td className="px-2 py-0 text-muted-foreground truncate align-middle border-b border-border/40">
                  {commit.author}
                </td>
                <td className="px-2 py-0 text-muted-foreground whitespace-nowrap align-middle border-b border-border/40">
                  {formatDate(commit.date)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollArea>
  );
}

/**
 * Special graph cell for the uncommitted changes row.
 * Always at the top, dot at lane 0 (leftmost), grey line going down.
 */
function UncommittedGraphCell({
  globalMaxLane,
}: {
  globalMaxLane: number;
}) {
  const width = (globalMaxLane + 1) * LANE_WIDTH + 4;
  const midY = ROW_HEIGHT / 2;
  const DOT_RADIUS = 4;
  const dotX = LANE_WIDTH / 2; // Always lane 0

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="block shrink-0"
      style={{ minWidth: width }}
    >
      {/* Grey line from dot down to next row */}
      <line
        x1={dotX}
        y1={midY + DOT_RADIUS}
        x2={dotX}
        y2={ROW_HEIGHT}
        stroke={UNCOMMITTED_COLOR}
        strokeWidth={2}
      />

      {/* Open circle (unfilled) with grey stroke */}
      <circle
        cx={dotX}
        cy={midY}
        r={DOT_RADIUS}
        fill="var(--background, #fff)"
        stroke={UNCOMMITTED_COLOR}
        strokeWidth={2}
      />
    </svg>
  );
}

function RefBadge({ refName, laneColor: color }: { refName: string; laneColor: string }) {
  if (refName.startsWith("HEAD -> ")) {
    const branch = refName.replace("HEAD -> ", "");
    return (
      <Badge
        className="text-[10px] px-1.5 py-0 h-4 font-mono text-white border-0"
        style={{ backgroundColor: color }}
      >
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
  // Remote branch or other ref — use lane color with reduced opacity
  return (
    <Badge
      className="text-[10px] px-1.5 py-0 h-4 font-mono text-white/90 border-0"
      style={{ backgroundColor: color, opacity: 0.75 }}
    >
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
