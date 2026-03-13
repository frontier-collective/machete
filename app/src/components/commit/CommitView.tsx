import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { Wand2, Loader2, ChevronDown } from "lucide-react";
import { useRepoPath, useStatus, useSelection, useLayout } from "@/hooks/useRepo";
import { useDrag } from "@/hooks/useDrag";
import type { CommitContext, CommitDetail, FileStatus } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export function CommitView() {
  const { repoPath } = useRepoPath();
  const { selectedCommitHash } = useSelection();

  if (!repoPath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Open a repository to get started.
      </div>
    );
  }

  // Two modes: null = staging area, string = commit detail
  if (selectedCommitHash) {
    return <CommitDetailView repoPath={repoPath} hash={selectedCommitHash} />;
  }

  return <StagingView repoPath={repoPath} />;
}

// ─── Commit detail view (when a commit row is selected) ─────────────

function CommitDetailView({ repoPath, hash }: { repoPath: string; hash: string }) {
  const { layout, updateLayout } = useLayout();
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const contextLines = layout.contextLines;

  // Resizable: left panel width
  const leftPanelPct = layout.detailLeftPanelPct;
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  // Resizable: files vs commit message split (percentage of left panel height)
  const filesPct = layout.detailFilesPct;

  const onLeftRightDrag = useCallback((delta: number) => {
    const area = mainAreaRef.current;
    if (!area) return;
    const w = area.getBoundingClientRect().width;
    if (w <= 0) return;
    updateLayout({ detailLeftPanelPct: Math.min(60, Math.max(20, leftPanelPct + (delta / w) * 100)) });
  }, [leftPanelPct, updateLayout]);
  const leftRightDragHandle = useDrag(onLeftRightDrag, "horizontal");

  const onFilesMsgDrag = useCallback((delta: number) => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    const h = panel.getBoundingClientRect().height;
    if (h <= 0) return;
    updateLayout({ detailFilesPct: Math.min(85, Math.max(25, filesPct + (delta / h) * 100)) });
  }, [filesPct, updateLayout]);
  const filesMsgDragHandle = useDrag(onFilesMsgDrag, "vertical");

  useEffect(() => {
    setLoading(true);
    setSelectedFile(null);
    setDiff("");
    invoke<CommitDetail>("get_commit_detail", { repoPath, hash })
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [repoPath, hash]);

  // Fetch diff for selected file (show the commit's diff for that file)
  useEffect(() => {
    if (!selectedFile || !hash) {
      setDiff("");
      return;
    }
    setDiffLoading(true);
    invoke<string>("get_file_diff", { repoPath, file: selectedFile, staged: false, commitHash: hash, contextLines })
      .then(setDiff)
      .catch((e) => setDiff(`Error loading diff: ${e}`))
      .finally(() => setDiffLoading(false));
  }, [repoPath, selectedFile, hash, contextLines]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading commit...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Failed to load commit detail
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col py-2">
      {/* Main area: files + diff */}
      <div ref={mainAreaRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel: files changed (top) + commit message (bottom) */}
        <div
          ref={leftPanelRef}
          className="flex flex-col overflow-hidden rounded-lg border bg-card"
          style={{ width: `${leftPanelPct}%` }}
        >
          {/* Files changed */}
          <div className="flex flex-col overflow-hidden" style={{ height: `${filesPct}%` }}>
            <div className="flex items-center px-3 pt-2 pb-1 shrink-0">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Files Changed
                <Badge variant="outline" className="ml-2">{detail.files.length}</Badge>
              </h3>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-3 pb-2">
                {detail.files.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">No files changed</p>
                ) : (
                  <ul className="space-y-0.5">
                    {detail.files.map((f) => (
                      <li
                        key={f.file}
                        className={`grid items-center rounded px-2 py-0.5 text-xs cursor-pointer hover:bg-accent ${
                          selectedFile === f.file ? "bg-accent" : ""
                        }`}
                        style={{ gridTemplateColumns: "auto 1fr auto" }}
                        onClick={() => setSelectedFile(f.file)}
                      >
                        <FileStatusIcon status={f.status} />
                        <span className="truncate min-w-0 ml-1.5">
                          {f.file.includes("/") && (
                            <span className="text-muted-foreground">
                              {f.file.slice(0, f.file.lastIndexOf("/") + 1)}
                            </span>
                          )}
                          {f.file.split("/").pop()}
                        </span>
                        <span className="pl-2 shrink-0 whitespace-nowrap">
                          {f.binary ? (
                            <span className="text-muted-foreground text-[10px]">binary</span>
                          ) : (
                            <span className="flex gap-1 text-[10px]">
                              {f.added > 0 && <span className="text-green-600 dark:text-green-400">+{f.added}</span>}
                              {f.removed > 0 && <span className="text-red-600 dark:text-red-400">-{f.removed}</span>}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Draggable files/message divider */}
          <div
            className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-brand/30 active:bg-brand/50 transition-colors"
            onMouseDown={filesMsgDragHandle}
          />

          {/* Commit message */}
          <div className="flex flex-col overflow-hidden" style={{ height: `${100 - filesPct}%` }}>
            <div className="px-3 pt-2 pb-1 shrink-0">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Commit Message</h3>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-3 pb-3">
                <pre className="text-xs whitespace-pre-wrap text-foreground font-mono leading-relaxed">
                  {detail.message}
                </pre>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {detail.author} · {detail.date}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground/60 font-mono select-all">
                  {detail.hash}
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Draggable left/right divider */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-brand/30 active:bg-brand/50 transition-colors"
          onMouseDown={leftRightDragHandle}
        />

        {/* Right panel: Diff */}
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
          {selectedFile ? (
            <>
              <div className="flex items-center border-b px-3 py-1.5 shrink-0 gap-2">
                <FileStatusIcon status={detail.files.find((f) => f.file === selectedFile)?.status} />
                <span className="text-xs font-medium truncate flex-1">{selectedFile}</span>
                <ContextLinesDropdown value={contextLines} onChange={(v) => updateLayout({ contextLines: v })} />
              </div>
              <div className="flex-1 min-h-0">
                {diffLoading ? (
                  <div className="flex items-center justify-center p-8 text-muted-foreground text-xs">
                    Loading diff...
                  </div>
                ) : (
                  <DiffViewer diff={diff} isBinaryHint={detail.files.find((f) => f.file === selectedFile)?.binary} fileInfo={detail.files.find((f) => f.file === selectedFile)} />
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
              Select a file to view diff
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── File status icon (A/M/D/R) ─────────────────────────────────────

function FileStatusIcon({ status }: { status?: string }) {
  switch (status) {
    case "A":
      return (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-green-600 dark:text-green-400 bg-green-500/15 shrink-0">
          A
        </span>
      );
    case "D":
      return (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-500/15 shrink-0">
          D
        </span>
      );
    case "R":
      return (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/15 shrink-0">
          R
        </span>
      );
    case "C":
      return (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/15 shrink-0">
          C
        </span>
      );
    case "M":
    default:
      return (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 shrink-0">
          M
        </span>
      );
  }
}

// ─── Context lines dropdown ─────────────────────────────────────────

const CONTEXT_OPTIONS = [1, 3, 6, 12, 25, 50, 100] as const;

function ContextLinesDropdown({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        onClick={() => setOpen(!open)}
        title="Lines of context"
      >
        <span className="font-mono">{value}</span>
        <span>lines</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 rounded-md border bg-card shadow-md py-1 min-w-[5rem]">
          {CONTEXT_OPTIONS.map((n) => (
            <button
              key={n}
              className={`flex w-full items-center px-3 py-1 text-xs hover:bg-accent ${
                n === value ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
              onClick={() => {
                onChange(n);
                setOpen(false);
              }}
            >
              {n} {n === 1 ? "line" : "lines"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Staging view (when uncommitted changes row is selected) ────────

function StagingView({ repoPath }: { repoPath: string }) {
  const { refreshStatus, status } = useStatus();
  const { layout, updateLayout } = useLayout();

  const [context, setContext] = useState<CommitContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileStaged, setSelectedFileStaged] = useState(false);
  const [diff, setDiff] = useState<string>("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resizable panel sizes from persisted layout
  const stagedPct = layout.stagingStagedPct;
  const leftPanelPct = layout.stagingLeftPanelPct;
  const bottomHeight = layout.stagingBottomHeight;

  const containerRef = useRef<HTMLDivElement>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  const onStagedDrag = useCallback((delta: number) => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    const h = panel.getBoundingClientRect().height;
    if (h <= 0) return;
    updateLayout({ stagingStagedPct: Math.min(85, Math.max(15, stagedPct + (delta / h) * 100)) });
  }, [stagedPct, updateLayout]);
  const stagedDragHandle = useDrag(onStagedDrag, "vertical");

  const onLeftRightDrag = useCallback((delta: number) => {
    const area = mainAreaRef.current;
    if (!area) return;
    const w = area.getBoundingClientRect().width;
    if (w <= 0) return;
    updateLayout({ stagingLeftPanelPct: Math.min(60, Math.max(20, leftPanelPct + (delta / w) * 100)) });
  }, [leftPanelPct, updateLayout]);
  const leftRightDragHandle = useDrag(onLeftRightDrag, "horizontal");

  const onBottomDrag = useCallback((delta: number) => {
    updateLayout({ stagingBottomHeight: Math.min(400, Math.max(80, bottomHeight - delta)) });
  }, [bottomHeight, updateLayout]);
  const bottomDragHandle = useDrag(onBottomDrag, "vertical");

  const fetchContext = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const ctx = await invoke<CommitContext>("get_commit_context", { repoPath });
      setContext(ctx);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  // Stable fingerprint: only refetch when staged/unstaged file lists change
  // (file names + counts — NOT on every status poll with identical data)
  const stagingTrigger = status
    ? `${status.stagedCount}:${status.unstagedCount}:${status.stagedFiles.join(",")}:${status.unstagedFiles.join(",")}`
    : "";

  useEffect(() => {
    fetchContext();
  }, [fetchContext, stagingTrigger]);

  const contextLines = layout.contextLines;

  const fetchDiff = useCallback(
    async (file: string, staged: boolean) => {
      if (!repoPath) return;
      setDiffLoading(true);
      try {
        const result = await invoke<string>("get_file_diff", {
          repoPath,
          file,
          staged,
          contextLines,
        });
        setDiff(result);
      } catch (e) {
        setDiff(`Error loading diff: ${e}`);
      } finally {
        setDiffLoading(false);
      }
    },
    [repoPath, contextLines]
  );

  // Re-fetch diff when file selection changes OR when staged/unstaged files change
  // (uses the same fingerprint — if a file's content changes, git status reports it
  // and the staging trigger will update, which re-triggers the context fetch above,
  // and the diff is re-fetched when the context changes)
  useEffect(() => {
    if (selectedFile) {
      fetchDiff(selectedFile, selectedFileStaged);
    } else {
      setDiff("");
    }
  }, [selectedFile, selectedFileStaged, fetchDiff, stagingTrigger]);

  async function handleStageFiles(files: string[]) {
    if (!repoPath) return;
    try {
      await invoke("stage_files", { repoPath, files });
      await fetchContext();
      refreshStatus();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleUnstageFiles(files: string[]) {
    if (!repoPath) return;
    try {
      await invoke("unstage_files", { repoPath, files });
      await fetchContext();
      refreshStatus();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleStageAll() {
    if (!context) return;
    await handleStageFiles(context.unstaged.map((f) => f.file));
  }

  async function handleUnstageAll() {
    if (!context) return;
    await handleUnstageFiles(context.staged.map((f) => f.file));
  }

  async function handleGenerate() {
    if (!repoPath) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await invoke<{ message?: string; error?: string }>("generate_commit_message", { repoPath });
      if (result.error) {
        setError(result.error);
      } else if (result.message) {
        setMessage(result.message);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCommit(andPush: boolean) {
    if (!repoPath || !message.trim() || !context?.staged.length) return;
    setCommitting(true);
    setError(null);
    try {
      await invoke("create_commit", { repoPath, message: message.trim() });
      if (andPush) {
        await invoke("push_current_branch", { repoPath });
      }
      setMessage("");
      setSelectedFile(null);
      setDiff("");
      await fetchContext();
      refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  }

  if (loading && !context) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
        Loading...
      </div>
    );
  }

  const staged = context?.staged ?? [];
  const unstaged = context?.unstaged ?? [];
  const canCommit = staged.length > 0 && message.trim().length > 0 && !committing;

  return (
    <div ref={containerRef} className="flex h-full flex-col py-2 gap-1">
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-xs text-destructive mb-2">
          {error}
        </div>
      )}

      {/* Main area: file list + diff */}
      <div ref={mainAreaRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel - File list */}
        <div
          ref={leftPanelRef}
          className="flex flex-col overflow-hidden rounded-lg border bg-card"
          style={{ width: `${leftPanelPct}%` }}
        >
          {/* Staged section */}
          <div className="flex flex-col overflow-hidden" style={{ height: `${stagedPct}%` }}>
            <div className="flex items-center justify-between px-3 pt-3 pb-1 shrink-0">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Staged
                {staged.length > 0 && (
                  <Badge variant="safe" className="ml-2">{staged.length}</Badge>
                )}
              </h3>
              {staged.length > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleUnstageAll}>
                  Unstage All
                </Button>
              )}
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-3 pb-2">
                {staged.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">No staged files</p>
                ) : (
                  <ul className="space-y-0.5">
                    {staged.map((f) => (
                      <FileRow
                        key={`staged-${f.file}`}
                        file={f}
                        checked={true}
                        selected={selectedFile === f.file && selectedFileStaged}
                        onCheckedChange={() => handleUnstageFiles([f.file])}
                        onSelect={() => { setSelectedFile(f.file); setSelectedFileStaged(true); }}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Draggable staged/unstaged divider */}
          <div
            className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-brand/30 active:bg-brand/50 transition-colors"
            onMouseDown={stagedDragHandle}
          />

          {/* Unstaged section */}
          <div className="flex flex-col overflow-hidden" style={{ height: `${100 - stagedPct}%` }}>
            <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Unstaged
                {unstaged.length > 0 && (
                  <Badge variant="outline" className="ml-2">{unstaged.length}</Badge>
                )}
              </h3>
              {unstaged.length > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleStageAll}>
                  Stage All
                </Button>
              )}
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-3 pb-3">
                {unstaged.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">No unstaged files</p>
                ) : (
                  <ul className="space-y-0.5">
                    {unstaged.map((f) => (
                      <FileRow
                        key={`unstaged-${f.file}`}
                        file={f}
                        checked={false}
                        selected={selectedFile === f.file && !selectedFileStaged}
                        onCheckedChange={() => handleStageFiles([f.file])}
                        onSelect={() => { setSelectedFile(f.file); setSelectedFileStaged(false); }}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Draggable left/right divider */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-brand/30 active:bg-brand/50 transition-colors"
          onMouseDown={leftRightDragHandle}
        />

        {/* Right panel - Diff viewer */}
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
          {selectedFile ? (
            <>
              <div className="flex items-center justify-between border-b px-3 py-1.5 shrink-0">
                <span className="text-xs font-medium truncate">{selectedFile}</span>
                <ContextLinesDropdown value={contextLines} onChange={(v) => updateLayout({ contextLines: v })} />
              </div>
              <div className="flex-1 min-h-0">
                {diffLoading ? (
                  <div className="flex items-center justify-center p-8 text-muted-foreground text-xs">
                    Loading diff...
                  </div>
                ) : (
                  <DiffViewer diff={diff} />
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
              Select a file to view diff
            </div>
          )}
        </div>
      </div>

      {/* Draggable divider above commit bar */}
      <div
        className="h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-brand/30 active:bg-brand/50 transition-colors"
        onMouseDown={bottomDragHandle}
      />

      {/* Bottom bar - Commit controls */}
      <div
        className="flex items-end gap-3 shrink-0"
        style={{ height: `${bottomHeight}px` }}
      >
        <Textarea
          placeholder="Commit message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex-1 h-full resize-none text-xs focus-visible:ring-brand focus-visible:border-brand"
        />
        <div className="flex flex-col gap-2">
          <Button
            variant="brand"
            size="sm"
            onClick={handleGenerate}
            disabled={generating || staged.length === 0}
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Generate with AI
          </Button>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleCommit(false)}
              disabled={!canCommit}
            >
              {committing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Commit
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleCommit(true)}
              disabled={!canCommit}
            >
              Commit & Push
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────

interface FileRowProps {
  file: FileStatus;
  checked: boolean;
  selected: boolean;
  onCheckedChange: () => void;
  onSelect: () => void;
}

function FileRow({ file, checked, selected, onCheckedChange, onSelect }: FileRowProps) {
  const filename = file.file.split("/").pop() ?? file.file;
  const dir = file.file.includes("/") ? file.file.slice(0, file.file.lastIndexOf("/") + 1) : "";

  const stats = file.binary ? (
    <span className="text-muted-foreground text-[10px]">binary</span>
  ) : (
    <span className="flex gap-1 text-[10px]">
      {file.added > 0 && <span className="text-green-600 dark:text-green-400">+{file.added}</span>}
      {file.removed > 0 && <span className="text-red-600 dark:text-red-400">-{file.removed}</span>}
    </span>
  );

  return (
    <li
      className={`grid items-center rounded px-2 py-0.5 text-xs cursor-pointer hover:bg-accent ${
        selected ? "bg-accent" : ""
      }`}
      style={{ gridTemplateColumns: "auto 1fr auto" }}
      onClick={onSelect}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        onClick={(e) => e.stopPropagation()}
        className="h-3.5 w-3.5 mr-1.5"
      />
      <span className="truncate min-w-0 text-left">
        {dir && <span className="text-muted-foreground">{dir}</span>}
        {filename}
      </span>
      <span className="pl-2 shrink-0 whitespace-nowrap">
        {stats}
      </span>
    </li>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function translateFileMode(mode: string): string {
  const m = mode.trim();
  // Git file modes: 100644 = regular file, 100755 = executable, 120000 = symlink, 160000 = submodule
  if (m === "100644") return "Regular file";
  if (m === "100755") return "Executable";
  if (m === "120000") return "Symbolic link";
  if (m === "160000") return "Git submodule";
  if (m === "040000") return "Directory";
  return `Mode ${m}`;
}

function BinaryFilePanel({ diff, fileInfo }: { diff: string; fileInfo?: FileStatus }) {
  // Extract metadata from diff headers if available
  const rawLines = diff ? diff.split("\n") : [];
  const meta: { label: string; value: string }[] = [];

  for (const l of rawLines) {
    if (l.startsWith("new file mode")) {
      const mode = l.replace("new file mode ", "").trim();
      meta.push({ label: "Type", value: `New file — ${translateFileMode(mode)}` });
    } else if (l.startsWith("deleted file mode")) {
      const mode = l.replace("deleted file mode ", "").trim();
      meta.push({ label: "Type", value: `Deleted — ${translateFileMode(mode)}` });
    } else if (l.startsWith("old mode")) {
      meta.push({ label: "Old mode", value: translateFileMode(l.replace("old mode ", "")) });
    } else if (l.startsWith("new mode")) {
      meta.push({ label: "New mode", value: translateFileMode(l.replace("new mode ", "")) });
    } else if (l.startsWith("similarity index")) {
      meta.push({ label: "Similarity", value: l.replace("similarity index ", "") });
    } else if (l.startsWith("rename from")) {
      meta.push({ label: "Renamed from", value: l.replace("rename from ", "") });
    } else if (l.startsWith("rename to")) {
      meta.push({ label: "Renamed to", value: l.replace("rename to ", "") });
    } else if (l.startsWith("index ")) {
      const parts = l.replace("index ", "").split(" ");
      meta.push({ label: "Object", value: parts[0] || "" });
    }
  }

  if (fileInfo?.size != null) {
    meta.push({ label: "Size", value: formatFileSize(fileInfo.size) });
  }

  // Detect file type from extension
  const fileName = fileInfo?.file || "";
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const typeMap: Record<string, string> = {
    db: "Database", sqlite: "SQLite database", sqlite3: "SQLite database",
    png: "PNG image", jpg: "JPEG image", jpeg: "JPEG image", gif: "GIF image",
    svg: "SVG image", webp: "WebP image", ico: "Icon",
    pdf: "PDF document", zip: "ZIP archive", gz: "Gzip archive", tar: "Tar archive",
    woff: "Web font", woff2: "Web font", ttf: "TrueType font", otf: "OpenType font",
    exe: "Executable", dll: "Library", so: "Shared library", dylib: "Dynamic library",
    bin: "Binary data", dat: "Data file",
  };
  const fileType = typeMap[ext];
  if (fileType && !meta.some((m) => m.label === "Type")) {
    meta.push({ label: "Type", value: fileType });
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-muted-foreground">
      <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-5 py-4">
        <span className="text-2xl">📦</span>
        <div>
          <p className="text-sm font-medium text-foreground">Binary file</p>
          <p className="text-xs text-muted-foreground">Content cannot be displayed as text</p>
        </div>
      </div>
      {meta.length > 0 && (
        <div className="rounded-md border border-border/30 bg-muted/20 px-4 py-3 text-xs w-full max-w-sm">
          <table className="w-full">
            <tbody>
              {meta.map((m, i) => (
                <tr key={i}>
                  <td className="pr-4 py-0.5 text-muted-foreground/70 font-medium whitespace-nowrap align-top">{m.label}</td>
                  <td className="py-0.5 text-foreground/80 font-mono break-all">{m.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Diff parsing (pure function, used inside useMemo) ──────────────

type ParsedLine =
  | { type: "hunk"; hunkNum: number; startLine: number; endLine: number; context: string }
  | { type: "add"; line: string; oldNum: null; newNum: number }
  | { type: "del"; line: string; oldNum: number; newNum: null }
  | { type: "ctx"; line: string; oldNum: number; newNum: number }
  | { type: "no-newline" };

interface ParsedDiff {
  status: "empty" | "binary" | "no-hunks" | "ok";
  parsed: ParsedLine[];
  showBothGutters: boolean;
}

function parseDiff(diff: string, isBinaryHint?: boolean): ParsedDiff {
  if (!diff.trim()) {
    return { status: isBinaryHint ? "binary" : "empty", parsed: [], showBothGutters: false };
  }

  const rawLines = diff.split("\n");

  const isBinary = rawLines.some(
    (l) => l.startsWith("Binary files ") || l.startsWith("GIT binary patch")
  );
  if (isBinary) {
    return { status: "binary", parsed: [], showBothGutters: false };
  }

  let startIdx = -1;
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].startsWith("@@")) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    return { status: "no-hunks", parsed: [], showBothGutters: false };
  }

  const lines = rawLines.slice(startIdx);
  let oldLine = 0;
  let newLine = 0;
  let hunkNum = 0;

  const parsed: ParsedLine[] = lines.map((line) => {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
    if (hunkMatch) {
      hunkNum++;
      const startOld = parseInt(hunkMatch[1], 10);
      const countOld = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
      oldLine = startOld;
      newLine = parseInt(hunkMatch[3], 10);
      const context = hunkMatch[5]?.trim() || "";
      return { type: "hunk" as const, hunkNum, startLine: startOld, endLine: startOld + countOld - 1, context };
    }
    if (line.startsWith("\\ ")) return { type: "no-newline" as const };
    if (line.startsWith("+")) {
      const entry: ParsedLine = { type: "add" as const, line, oldNum: null, newNum: newLine };
      newLine++;
      return entry;
    }
    if (line.startsWith("-")) {
      const entry: ParsedLine = { type: "del" as const, line, oldNum: oldLine, newNum: null };
      oldLine++;
      return entry;
    }
    const entry: ParsedLine = { type: "ctx" as const, line, oldNum: oldLine, newNum: newLine };
    oldLine++;
    newLine++;
    return entry;
  });

  const hasOld = parsed.some((p) => p.type === "del" || p.type === "ctx");
  const hasNew = parsed.some((p) => p.type === "add" || p.type === "ctx");

  return { status: "ok", parsed, showBothGutters: hasOld && hasNew };
}

// ─── Virtualized diff row height ─────────────────────────────────────

const DIFF_ROW_HEIGHT = 20; // matches text-xs leading-relaxed
const HUNK_ROW_HEIGHT = 28; // slightly taller for hunk headers

// ─── Diff viewer (memoized parse + virtualized render) ──────────────

function DiffViewer({ diff, isBinaryHint, fileInfo }: { diff: string; isBinaryHint?: boolean; fileInfo?: FileStatus }) {
  // Memoize parsing — only re-parse when the diff string changes
  const { status, parsed, showBothGutters } = useMemo(
    () => parseDiff(diff, isBinaryHint),
    [diff, isBinaryHint]
  );

  // Virtualized scroll container
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: parsed.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => parsed[i]?.type === "hunk" ? HUNK_ROW_HEIGHT : DIFF_ROW_HEIGHT,
    overscan: 20,
  });

  if (status === "binary") {
    return <BinaryFilePanel diff={diff} fileInfo={fileInfo} />;
  }
  if (status === "empty") {
    return (
      <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
        No diff available
      </div>
    );
  }
  if (status === "no-hunks") {
    return (
      <pre className="text-xs leading-relaxed">
        <code>
          <div className="flex">
            <span className="inline-block w-10 shrink-0 select-none text-right pr-1 text-muted-foreground/50 border-r border-border/30">
              1
            </span>
            <span className="inline-block w-10 shrink-0 select-none text-right pr-2 text-muted-foreground/50" />
            <span className="flex-1 whitespace-pre-wrap break-all px-2 text-muted-foreground/50 italic">
              Empty file
            </span>
          </div>
        </code>
      </pre>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <pre className="text-xs leading-relaxed">
        <code>
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const p = parsed[virtualRow.index];
              return (
                <div
                  key={virtualRow.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <DiffLine p={p} showBothGutters={showBothGutters} />
                </div>
              );
            })}
          </div>
        </code>
      </pre>
    </div>
  );
}

// ─── Memoized diff line row ─────────────────────────────────────────

const DiffLine = memo(function DiffLine({
  p,
  showBothGutters,
}: {
  p: ParsedLine;
  showBothGutters: boolean;
}) {
  if (p.type === "no-newline") {
    return (
      <div className="flex h-full bg-amber-500/15">
        {showBothGutters && (
          <span className="inline-block w-10 shrink-0 select-none text-right pr-1 text-muted-foreground/50 border-r border-border/30" />
        )}
        <span className="inline-block w-10 shrink-0 select-none text-right pr-2 text-muted-foreground/50" />
        <span className="flex-1 whitespace-pre-wrap break-all px-2 text-amber-600 dark:text-amber-400 italic">
          \ No newline at end of file
        </span>
      </div>
    );
  }

  if (p.type === "hunk") {
    return (
      <div className="flex items-center h-full border-y border-border/40 bg-muted/50 px-3 select-none">
        <span className="text-[10px] font-medium text-muted-foreground">
          Hunk {p.hunkNum} : Lines {p.startLine}-{p.endLine}
        </span>
        {p.context && (
          <span className="ml-3 text-[10px] text-muted-foreground/70 truncate">
            {p.context}
          </span>
        )}
      </div>
    );
  }

  let bgClass = "";
  let textClass = "text-foreground";
  if (p.type === "add") {
    bgClass = "bg-green-500/10";
    textClass = "text-green-700 dark:text-green-400";
  } else if (p.type === "del") {
    bgClass = "bg-red-500/10";
    textClass = "text-red-700 dark:text-red-400";
  }

  return (
    <div className={`flex h-full ${bgClass}`}>
      {showBothGutters && (
        <span className="inline-block w-10 shrink-0 select-none text-right pr-1 text-muted-foreground/50 border-r border-border/30">
          {p.oldNum ?? ""}
        </span>
      )}
      <span className="inline-block w-10 shrink-0 select-none text-right pr-2 text-muted-foreground/50">
        {showBothGutters ? (p.newNum ?? "") : (p.oldNum ?? p.newNum ?? "")}
      </span>
      <span className={`flex-1 whitespace-pre break-all px-2 ${textClass}`}>
        {p.type === "add"
          ? `+ ${p.line.slice(1)}`
          : p.type === "del"
            ? `- ${p.line.slice(1)}`
            : `  ${p.line.slice(1)}`}
      </span>
    </div>
  );
});
