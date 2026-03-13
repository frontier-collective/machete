import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Wand2, Loader2 } from "lucide-react";
import { useRepo } from "@/hooks/useRepo";
import { useDrag } from "@/hooks/useDrag";
import type { CommitContext, FileStatus } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export function CommitView() {
  const { repoPath, refreshStatus } = useRepo();

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

  // Resizable panel sizes (percentages / pixels)
  const [stagedPct, setStagedPct] = useState(50); // % of left panel for staged
  const [leftPanelPct, setLeftPanelPct] = useState(33); // % of main area for file list
  const [bottomHeight, setBottomHeight] = useState(120); // px for commit bar

  const containerRef = useRef<HTMLDivElement>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  // Drag: staged/unstaged split
  const onStagedDrag = useCallback(
    (delta: number) => {
      const panel = leftPanelRef.current;
      if (!panel) return;
      const h = panel.getBoundingClientRect().height;
      if (h <= 0) return;
      const pctDelta = (delta / h) * 100;
      setStagedPct((prev) => Math.min(85, Math.max(15, prev + pctDelta)));
    },
    []
  );
  const stagedDragHandle = useDrag(onStagedDrag, "vertical");

  // Drag: left/right panel split
  const onLeftRightDrag = useCallback(
    (delta: number) => {
      const area = mainAreaRef.current;
      if (!area) return;
      const w = area.getBoundingClientRect().width;
      if (w <= 0) return;
      const pctDelta = (delta / w) * 100;
      setLeftPanelPct((prev) => Math.min(60, Math.max(20, prev + pctDelta)));
    },
    []
  );
  const leftRightDragHandle = useDrag(onLeftRightDrag, "horizontal");

  // Drag: bottom commit bar height (dragging up = bigger)
  const onBottomDrag = useCallback(
    (delta: number) => {
      setBottomHeight((prev) => Math.min(400, Math.max(80, prev - delta)));
    },
    []
  );
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

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  const fetchDiff = useCallback(
    async (file: string, staged: boolean) => {
      if (!repoPath) return;
      setDiffLoading(true);
      try {
        const result = await invoke<string>("get_file_diff", { repoPath, file, staged });
        setDiff(result);
      } catch (e) {
        setDiff(`Error loading diff: ${e}`);
      } finally {
        setDiffLoading(false);
      }
    },
    [repoPath]
  );

  useEffect(() => {
    if (selectedFile) {
      fetchDiff(selectedFile, selectedFileStaged);
    } else {
      setDiff("");
    }
  }, [selectedFile, selectedFileStaged, fetchDiff]);

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

  if (!repoPath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Open a repository to get started.
      </div>
    );
  }

  if (loading && !context) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  const staged = context?.staged ?? [];
  const unstaged = context?.unstaged ?? [];
  const canCommit = staged.length > 0 && message.trim().length > 0 && !committing;

  return (
    <div ref={containerRef} className="flex h-full flex-col">
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive mb-2">
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
            className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-primary/30 active:bg-primary/50 transition-colors"
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
          className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30 active:bg-primary/50 transition-colors mx-1 rounded"
          onMouseDown={leftRightDragHandle}
        />

        {/* Right panel - Diff viewer */}
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
          {selectedFile ? (
            <>
              <div className="border-b px-4 py-2 shrink-0">
                <span className="text-sm font-medium">{selectedFile}</span>
              </div>
              <ScrollArea className="flex-1">
                {diffLoading ? (
                  <div className="flex items-center justify-center p-8 text-muted-foreground">
                    Loading diff...
                  </div>
                ) : (
                  <DiffViewer diff={diff} />
                )}
              </ScrollArea>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              Select a file to view diff
            </div>
          )}
        </div>
      </div>

      {/* Draggable divider above commit bar */}
      <div
        className="h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-primary/30 active:bg-primary/50 transition-colors my-1 rounded"
        onMouseDown={bottomDragHandle}
      />

      {/* Bottom bar - Commit controls */}
      <div
        className="flex items-end gap-3 rounded-lg border bg-card p-3 shrink-0"
        style={{ height: `${bottomHeight}px` }}
      >
        <div className="flex-1 h-full">
          <Textarea
            placeholder="Commit message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="h-full resize-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
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

// --- Sub-components ---

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

  return (
    <li
      className={`flex items-center gap-2 rounded px-2 py-1 text-sm cursor-pointer hover:bg-accent ${
        selected ? "bg-accent" : ""
      }`}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        className="flex flex-1 items-center gap-1 overflow-hidden text-left"
        onClick={onSelect}
        type="button"
      >
        <span className="truncate">
          {dir && <span className="text-muted-foreground">{dir}</span>}
          {filename}
        </span>
        <span className="ml-auto flex shrink-0 gap-1 text-xs">
          {file.binary ? (
            <span className="text-muted-foreground">binary</span>
          ) : (
            <>
              {file.added > 0 && <span className="text-green-600 dark:text-green-400">+{file.added}</span>}
              {file.removed > 0 && <span className="text-red-600 dark:text-red-400">-{file.removed}</span>}
            </>
          )}
        </span>
      </button>
    </li>
  );
}

interface DiffViewerProps {
  diff: string;
}

function DiffViewer({ diff }: DiffViewerProps) {
  if (!diff.trim()) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        No diff available
      </div>
    );
  }

  const lines = diff.split("\n");

  return (
    <pre className="text-xs leading-relaxed">
      <code>
        {lines.map((line, i) => {
          let bgClass = "";
          let textClass = "text-foreground";

          if (line.startsWith("+") && !line.startsWith("+++")) {
            bgClass = "bg-green-500/10";
            textClass = "text-green-700 dark:text-green-400";
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            bgClass = "bg-red-500/10";
            textClass = "text-red-700 dark:text-red-400";
          } else if (line.startsWith("@@")) {
            textClass = "text-blue-600 dark:text-blue-400";
          } else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
            textClass = "text-muted-foreground";
          }

          return (
            <div key={i} className={`flex ${bgClass}`}>
              <span className="inline-block w-12 shrink-0 select-none text-right pr-3 text-muted-foreground/50">
                {i + 1}
              </span>
              <span className={`flex-1 whitespace-pre-wrap break-all px-2 ${textClass}`}>
                {line}
              </span>
            </div>
          );
        })}
      </code>
    </pre>
  );
}
