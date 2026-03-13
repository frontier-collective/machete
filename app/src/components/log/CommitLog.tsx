import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useRepo } from "@/hooks/useRepo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { CommitLogEntry } from "@/types";
import { computeGraphLayout } from "./graphLayout";
import { GraphColumn, LANE_WIDTH, ROW_HEIGHT } from "./GraphColumn";

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
  const graphRows = useMemo(() => computeGraphLayout(commits), [commits]);
  const globalMaxLane = useMemo(
    () => graphRows.reduce((max, r) => Math.max(max, r.maxLane), 0),
    [graphRows]
  );
  const graphColWidth = (globalMaxLane + 1) * LANE_WIDTH + 8;

  // Determine if there are uncommitted changes
  const hasUncommitted = status && !status.isClean;

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

  // Build the uncommitted changes graph row: sits in lane 0,
  // line below connects to the first commit, no line above
  const uncommittedGraphRow = graphRows.length > 0
    ? {
        lane: graphRows[0].lane,
        color: graphRows[0].color,
        segments: graphRows[0].segments
          .filter((s) => s.fromLane === s.toLane) // only pass-through lines
          .map((s) => ({ ...s })),
        maxLane: graphRows[0].maxLane,
        hasLineAbove: false,
        hasLineBelow: true,
      }
    : null;

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
          {/* Uncommitted changes row */}
          {hasUncommitted && uncommittedGraphRow && (
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
                <UncommittedGraphCell row={uncommittedGraphRow} globalMaxLane={globalMaxLane} />
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
                  <GraphColumn row={graphRows[i]} globalMaxLane={globalMaxLane} />
                </td>
                <td className="px-2 py-0 font-mono text-muted-foreground align-middle border-b border-border/40">
                  {commit.shortHash}
                </td>
                <td className="px-2 py-0 align-middle border-b border-border/40">
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
 * Shows an open circle (unfilled dot) at the HEAD lane position,
 * with a line going down to the first real commit.
 */
function UncommittedGraphCell({
  row,
  globalMaxLane,
}: {
  row: import("./graphLayout").CommitGraphRow;
  globalMaxLane: number;
}) {
  const width = (globalMaxLane + 1) * LANE_WIDTH + 4;
  const midY = ROW_HEIGHT / 2;
  const DOT_RADIUS = 4;
  const commitX = row.lane * LANE_WIDTH + LANE_WIDTH / 2;

  const LANE_COLORS = [
    "hsl(210, 80%, 55%)",
    "hsl(340, 75%, 55%)",
    "hsl(150, 65%, 45%)",
    "hsl(30, 85%, 55%)",
    "hsl(270, 65%, 60%)",
    "hsl(180, 60%, 45%)",
    "hsl(50, 80%, 50%)",
    "hsl(0, 70%, 55%)",
  ];
  const color = LANE_COLORS[row.color % LANE_COLORS.length];

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="block shrink-0"
      style={{ minWidth: width }}
    >
      {/* Pass-through lines for other lanes */}
      {row.segments.map((seg, i) => {
        const x = seg.fromLane * LANE_WIDTH + LANE_WIDTH / 2;
        const segColor = LANE_COLORS[seg.color % LANE_COLORS.length];
        return (
          <line
            key={i}
            x1={x}
            y1={0}
            x2={x}
            y2={ROW_HEIGHT}
            stroke={segColor}
            strokeWidth={2}
          />
        );
      })}

      {/* Line from dot down to next row */}
      <line
        x1={commitX}
        y1={midY + DOT_RADIUS}
        x2={commitX}
        y2={ROW_HEIGHT}
        stroke={color}
        strokeWidth={2}
      />

      {/* Open circle (unfilled) for uncommitted changes */}
      <circle
        cx={commitX}
        cy={midY}
        r={DOT_RADIUS}
        fill="var(--background, #fff)"
        stroke={color}
        strokeWidth={2}
      />
    </svg>
  );
}

function RefBadge({ refName }: { refName: string }) {
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
    return (
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-mono">
        {refName}
      </Badge>
    );
  }
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
