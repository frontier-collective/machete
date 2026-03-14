import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, CircleDot } from "lucide-react";
import { useRepoPath, useStatus, useSelection } from "@/hooks/useRepo";
import { useKeyboardShortcuts, type ShortcutDef } from "@/hooks/useKeyboardShortcuts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CommitLogEntry } from "@/types";
import { computeGraphLayout, type CommitGraphRow } from "./graphLayout";
import { GraphColumn, LANE_WIDTH, ROW_HEIGHT, UNCOMMITTED_COLOR, laneColor } from "./GraphColumn";

const GRID_COLS = "4.5rem 1fr 7rem 5.5rem";

export function CommitLog() {
  const { repoPath } = useRepoPath();
  const { status, refreshStatus } = useStatus();
  const { selectedBranch, selectedCommitHash, setSelectedCommitHash } = useSelection();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [cherryPickLoading, setCherryPickLoading] = useState<string | null>(null);
  const [cherryPickResult, setCherryPickResult] = useState<{ success: boolean; message: string } | null>(null);
  const [detachConfirm, setDetachConfirm] = useState<CommitLogEntry | null>(null);
  const [commits, setCommits] = useState<CommitLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const hasLoaded = useRef(false);
  const lastCommitsJson = useRef<string>("");

  // Build a stable "fingerprint" of status that only changes when we need to refetch the log
  // (branch switch, commit count changes, ahead/behind changes — NOT staged/unstaged file changes)
  const logTrigger = status ? `${status.branch}:${status.stagedCount + status.unstagedCount}:${status.isClean}:${status.aheadCount}:${status.behindCount}` : "";

  const fetchLog = useCallback(async () => {
    if (!repoPath) return;
    if (!hasLoaded.current) setLoading(true);
    try {
      const result = await invoke<CommitLogEntry[]>("get_commit_log", {
        repoPath,
      });
      // Only update state if commits or refs actually changed (prevents flickering).
      // Include refs so branch creation/deletion, tag changes, etc. are picked up.
      const json = JSON.stringify(result.map((c) => `${c.hash}:${c.refs.join(",")}`));
      if (json !== lastCommitsJson.current) {
        lastCommitsJson.current = json;
        setCommits(result);
      }
    } catch {
      // Non-critical — leave empty
    } finally {
      hasLoaded.current = true;
      setLoading(false);
    }
  }, [repoPath]);

  // Refresh log when branch/clean-state changes (NOT on every staged file change)
  useEffect(() => {
    fetchLog();
  }, [fetchLog, logTrigger]);

  // Also listen for filesystem changes (merge/rebase/commit updates .git/refs/)
  // so the graph refreshes even if the status fingerprint doesn't capture it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unlisten = listen("repo-fs-changed", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchLog, 300);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unlisten.then((fn) => fn());
    };
  }, [fetchLog]);

  // Refresh after fetch/prune to update branch badges
  useEffect(() => {
    const unlisten = listen("remote-fetched", () => { fetchLog(); });
    return () => { unlisten.then((fn) => fn()); };
  }, [fetchLog]);

  // Build a set of local branch names from the log's refs.
  // "HEAD -> X" is always a local branch. We also collect all refs and
  // subtract remote-tracking ones (which contain a remote prefix matching
  // a ref that also appears without it, e.g. "origin/main" vs "main").
  const localBranchNames = useMemo(() => {
    const allRefs = new Set<string>();
    const headRefs = new Set<string>();
    for (const c of commits) {
      for (const ref of c.refs) {
        if (ref.startsWith("HEAD -> ")) {
          headRefs.add(ref.replace("HEAD -> ", ""));
        } else if (!ref.startsWith("tag: ")) {
          allRefs.add(ref);
        }
      }
    }
    // A ref is remote-tracking if some other ref is a suffix of it after
    // stripping a "remoteName/" prefix. Collect remote prefixes by finding
    // refs where stripping a prefix yields a known HEAD ref.
    const remotePrefixes = new Set<string>();
    for (const ref of allRefs) {
      for (const localName of headRefs) {
        if (ref.endsWith(localName) && ref.length > localName.length) {
          remotePrefixes.add(ref.slice(0, ref.length - localName.length));
        }
      }
    }
    // Now identify local branches: HEAD refs + non-remote allRefs
    const locals = new Set(headRefs);
    for (const ref of allRefs) {
      const isRemote = [...remotePrefixes].some((p) => ref.startsWith(p));
      if (!isRemote) locals.add(ref);
    }
    return locals;
  }, [commits]);

  // Find a local branch at this commit that isn't the current branch.
  const getCheckoutBranch = useCallback((commit: CommitLogEntry): string | null => {
    const currentBranch = status?.branch;
    for (const ref of commit.refs) {
      if (ref.startsWith("tag: ")) continue;
      const branch = ref.startsWith("HEAD -> ") ? ref.replace("HEAD -> ", "") : ref;
      if (branch === currentBranch) continue;
      if (localBranchNames.has(branch)) return branch;
    }
    return null;
  }, [status?.branch, localBranchNames]);

  // Find the current HEAD commit hash (for no-op detection)
  const currentHeadHash = useMemo(() => {
    for (const c of commits) {
      // On a branch: refs include "HEAD -> branchname"
      if (c.refs.some((r) => r.startsWith("HEAD -> "))) return c.hash;
      // Detached HEAD: refs include bare "HEAD"
      if (c.refs.includes("HEAD")) return c.hash;
    }
    return null;
  }, [commits]);

  const doCheckout = useCallback(async (ref: string) => {
    if (!repoPath) return;
    setCheckoutLoading(ref);
    try {
      await invoke("checkout_branch", { repoPath, branch: ref });
      refreshStatus();
    } catch {
      // Checkout failed (dirty working tree, etc.) — silently ignore
    } finally {
      setCheckoutLoading(null);
    }
  }, [repoPath, refreshStatus]);

  const handleDoubleClick = useCallback(async (commit: CommitLogEntry) => {
    if (!repoPath || checkoutLoading) return;
    // No-op if already at this commit
    if (commit.hash === currentHeadHash) return;
    // Prefer checking out a local branch if one points here
    const branch = getCheckoutBranch(commit);
    if (branch) {
      doCheckout(branch);
      return;
    }
    // No local branch → will detach HEAD. Show confirmation.
    setDetachConfirm(commit);
  }, [repoPath, checkoutLoading, currentHeadHash, getCheckoutBranch, doCheckout]);

  const handleCherryPick = useCallback(async (commit: CommitLogEntry) => {
    if (!repoPath || cherryPickLoading) return;
    setCherryPickLoading(commit.hash);
    setCherryPickResult(null);
    try {
      await invoke("cherry_pick", { repoPath, commitHash: commit.hash });
      setCherryPickResult({ success: true, message: `Cherry-picked ${commit.shortHash}: ${commit.message}` });
      refreshStatus();
      fetchLog();
    } catch (e) {
      setCherryPickResult({ success: false, message: String(e) });
    } finally {
      setCherryPickLoading(null);
    }
  }, [repoPath, cherryPickLoading, refreshStatus, fetchLog]);

  // Compute graph layout from commits
  const baseGraphRows = useMemo(() => computeGraphLayout(commits), [commits]);

  // Determine if there are uncommitted changes
  const hasUncommitted = status && !status.isClean;

  // Find the HEAD commit index — the one with "HEAD -> branch" or bare "HEAD" (detached) in its refs
  const headCommitIndex = useMemo(() => {
    for (let i = 0; i < commits.length; i++) {
      if (commits[i].refs.some((r) => r.startsWith("HEAD -> ") || r === "HEAD")) return i;
    }
    return 0; // fallback to first
  }, [commits]);

  // Post-process: ensure HEAD's branch is always in lane 0 (leftmost).
  // The uncommitted dot sits directly above HEAD at lane 0 — no lane shifting needed.
  const graphRows: CommitGraphRow[] = useMemo(() => {
    if (baseGraphRows.length === 0) return baseGraphRows;

    // Find which lane HEAD occupies
    const headLane = baseGraphRows[headCommitIndex]?.lane ?? 0;

    if (headLane === 0) return baseGraphRows;

    // Remap lanes: swap headLane and lane 0
    const remap = (lane: number): number => {
      if (lane === headLane) return 0;
      if (lane === 0) return headLane;
      return lane;
    };

    return baseGraphRows.map((row) => ({
      ...row,
      lane: remap(row.lane),
      segments: row.segments.map((s) => ({
        ...s,
        fromLane: remap(s.fromLane),
        toLane: remap(s.toLane),
      })),
      // maxLane stays the same since we're just swapping
    }));
  }, [baseGraphRows, headCommitIndex]);

  const globalMaxLane = useMemo(
    () => graphRows.reduce((max, r) => Math.max(max, r.maxLane), 0),
    [graphRows]
  );
  const graphColWidth = (globalMaxLane + 1) * LANE_WIDTH + 8;

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

  // Virtualized scroll container
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // When sidebar selection changes, sync selectedCommitHash and scroll into view
  useEffect(() => {
    if (!highlightHash) return;
    setSelectedCommitHash(highlightHash);
    const index = commits.findIndex((c) => c.hash === highlightHash);
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" });
    }
  }, [highlightHash, setSelectedCommitHash, commits, virtualizer]);

  // ── Keyboard shortcuts ────────────────────────────────────────────
  const scrollToTop = useCallback(() => {
    // Select uncommitted row if it exists, otherwise the first commit
    if (hasUncommitted) {
      setSelectedCommitHash(null);
    } else if (commits.length > 0) {
      setSelectedCommitHash(commits[0].hash);
    }
    // Scroll the virtualizer to the very top
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [hasUncommitted, commits, setSelectedCommitHash]);

  const logShortcuts = useMemo<ShortcutDef[]>(() => [
    { key: "ArrowUp", meta: true, handler: scrollToTop },
  ], [scrollToTop]);
  useKeyboardShortcuts(logShortcuts);

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

  const gridTemplate = `${graphColWidth}px ${GRID_COLS}`;

  return (
    <div className="flex h-full flex-col text-xs">
      {/* Sticky header */}
      <div
        className="grid shrink-0 border-b text-muted-foreground font-medium bg-card z-10"
        style={{ gridTemplateColumns: gridTemplate, height: ROW_HEIGHT }}
      >
        <div className="px-1 flex items-center" />
        <div className="px-2 flex items-center">Hash</div>
        <div className="px-2 flex items-center">Message</div>
        <div className="px-2 flex items-center">Author</div>
        <div className="px-2 flex items-center">Date</div>
      </div>

      {/* Uncommitted changes row — always at top, outside virtualizer */}
      {hasUncommitted && graphRows.length > 0 && (
        <div
          className={`grid shrink-0 cursor-pointer ${
            selectedCommitHash === null
              ? "bg-amber-500/10 hover:bg-amber-500/15"
              : "bg-amber-500/5 hover:bg-amber-500/10"
          }`}
          style={{ gridTemplateColumns: gridTemplate, height: ROW_HEIGHT }}
          onClick={() => setSelectedCommitHash(null)}
        >
          <div className="flex items-center">
            <UncommittedGraphCell globalMaxLane={globalMaxLane} />
          </div>
          <div className="px-2 font-mono text-muted-foreground flex items-center border-b border-border/40">•</div>
          <div className="px-2 flex items-center border-b border-border/40">
            <span className="text-amber-600 dark:text-amber-400 font-medium">Uncommitted changes</span>
          </div>
          <div className="px-2 text-muted-foreground flex items-center border-b border-border/40">•</div>
          <div className="px-2 text-muted-foreground flex items-center border-b border-border/40">•</div>
        </div>
      )}

      {/* Virtualized commit list */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const i = virtualRow.index;
            const commit = commits[i];
            const graphRow = graphRows[i];

            return (
              <CommitRow
                key={commit.hash}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: ROW_HEIGHT,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                commit={commit}
                graphRow={graphRow}
                globalMaxLane={globalMaxLane}
                gridTemplate={gridTemplate}
                isSelected={commit.hash === selectedCommitHash}
                isHighlighted={commit.hash === highlightHash}
                isHeadCommit={commit.hash === currentHeadHash}
                showUncommittedPassThrough={!!(hasUncommitted && i < headCommitIndex)}
                showUncommittedCurve={!!(hasUncommitted && i === headCommitIndex)}
                onClick={() => setSelectedCommitHash(commit.hash)}
                onDoubleClick={() => handleDoubleClick(commit)}
                onCherryPick={() => handleCherryPick(commit)}
                cherryPickLoading={cherryPickLoading === commit.hash}
              />
            );
          })}
        </div>
      </div>

      {/* Cherry-pick result banner */}
      {cherryPickResult && (
        <div className={`flex items-center gap-2 px-3 py-1.5 text-xs shrink-0 ${
          cherryPickResult.success
            ? "bg-green-500/10 text-green-700 dark:text-green-400"
            : "bg-destructive/10 text-destructive"
        }`}>
          <span className="flex-1 truncate">{cherryPickResult.message}</span>
          <button onClick={() => setCherryPickResult(null)} className="shrink-0 font-medium hover:opacity-70">Dismiss</button>
        </div>
      )}

      {/* Detached HEAD confirmation dialog */}
      <Dialog open={!!detachConfirm} onOpenChange={(open) => { if (!open) setDetachConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detach HEAD?</DialogTitle>
            <DialogDescription>
              Checking out commit <span className="font-mono font-semibold">{detachConfirm?.shortHash}</span> will
              put you in a detached HEAD state. Any new commits you make won't belong to a branch
              unless you create one.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
            <span className="font-mono">{detachConfirm?.shortHash}</span>{" "}
            {detachConfirm?.message}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetachConfirm(null)} disabled={!!checkoutLoading}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (detachConfirm) {
                  doCheckout(detachConfirm.hash);
                  setDetachConfirm(null);
                }
              }}
              disabled={!!checkoutLoading}
            >
              {checkoutLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Detach HEAD
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Memoized commit row ─────────────────────────────────────────────

interface CommitRowProps {
  style: React.CSSProperties;
  commit: CommitLogEntry;
  graphRow: CommitGraphRow;
  globalMaxLane: number;
  gridTemplate: string;
  isSelected: boolean;
  isHighlighted: boolean;
  isHeadCommit: boolean;
  showUncommittedPassThrough: boolean;
  showUncommittedCurve: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onCherryPick?: () => void;
  cherryPickLoading?: boolean;
}

const CommitRow = memo(function CommitRow({
  style,
  commit,
  graphRow,
  globalMaxLane,
  gridTemplate,
  isSelected,
  isHighlighted,
  isHeadCommit,
  showUncommittedPassThrough,
  showUncommittedCurve,
  onClick,
  onDoubleClick,
  onCherryPick,
  cherryPickLoading,
}: CommitRowProps) {
  const row = (
    <div
      className={`grid cursor-pointer ${
        isSelected
          ? "bg-primary/15 hover:bg-primary/20"
          : isHighlighted
            ? "bg-primary/10 hover:bg-primary/15"
            : "hover:bg-accent/50"
      }`}
      style={{ ...style, gridTemplateColumns: gridTemplate }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="flex items-center">
        <GraphColumn
          row={graphRow}
          globalMaxLane={globalMaxLane}
          uncommittedPassThrough={showUncommittedPassThrough}
          uncommittedCurveToHead={showUncommittedCurve}
        />
      </div>
      <div className="px-2 font-mono text-muted-foreground flex items-center border-b border-border/40 truncate">
        {commit.shortHash}
      </div>
      <div className="px-2 flex items-center border-b border-border/40 min-w-0">
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
      </div>
      <div className="px-2 text-muted-foreground flex items-center border-b border-border/40 truncate">
        {commit.author}
      </div>
      <div className="px-2 text-muted-foreground flex items-center border-b border-border/40 whitespace-nowrap">
        {formatDate(commit.date)}
      </div>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {row}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={isHeadCommit || !!cherryPickLoading}
          onClick={() => onCherryPick?.()}
        >
          {cherryPickLoading ? "Cherry-picking..." : `Cherry-pick ${commit.shortHash}`}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => navigator.clipboard.writeText(commit.hash)}
        >
          Copy full hash
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => navigator.clipboard.writeText(commit.shortHash)}
        >
          Copy short hash
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => navigator.clipboard.writeText(commit.message)}
        >
          Copy message
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

// ─── Sub-components ─────────────────────────────────────────────────

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
  // Detached HEAD — bare "HEAD" ref with icon
  if (refName === "HEAD") {
    return (
      <Badge
        className="text-[10px] px-1.5 py-0 h-4 font-mono text-white border-0 select-none flex items-center gap-0.5"
        style={{ backgroundColor: color }}
      >
        <CircleDot className="h-2.5 w-2.5" />
        HEAD
      </Badge>
    );
  }
  if (refName.startsWith("HEAD -> ")) {
    const branch = refName.replace("HEAD -> ", "");
    return (
      <Badge
        className="text-[10px] px-1.5 py-0 h-4 font-mono text-white border-0 select-none"
        style={{ backgroundColor: color }}
      >
        {branch}
      </Badge>
    );
  }
  if (refName.startsWith("tag: ")) {
    const tag = refName.replace("tag: ", "");
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono border-amber-500/50 text-amber-600 dark:text-amber-400 select-none">
        {tag}
      </Badge>
    );
  }
  // Remote branch or other ref — use lane color with reduced opacity
  return (
    <Badge
      className="text-[10px] px-1.5 py-0 h-4 font-mono text-white/90 border-0 select-none"
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
