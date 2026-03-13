import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GitPullRequest,
  GitBranch,
  FileText,
  Loader2,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Plus,
  Minus,
  ArrowRight,
} from "lucide-react";
import { useRepoPath, useStatus } from "@/hooks/useRepo";
import type { PrContext } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

export function PrView() {
  const { repoPath } = useRepoPath();
  const { status } = useStatus();

  const [base, setBase] = useState("");
  const [baseDetected, setBaseDetected] = useState(false);
  const [context, setContext] = useState<PrContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  // Auto-detect base branch on mount
  useEffect(() => {
    if (!repoPath || baseDetected) return;
    (async () => {
      try {
        const detected = await invoke<string>("get_default_base_branch", { repoPath });
        setBase(detected);
      } catch {
        // Fall back to "main"
        setBase("main");
      }
      setBaseDetected(true);
    })();
  }, [repoPath, baseDetected]);

  // Auto-load context once base is detected
  const loadContext = useCallback(async () => {
    if (!repoPath) {
      setContextError("No repository open");
      return;
    }
    if (!base) {
      setContextError("No base branch specified");
      return;
    }
    setContextLoading(true);
    setContextError(null);
    try {
      const result = await invoke<PrContext>("get_pr_context", {
        repoPath,
        base,
      });
      // Defensive: ensure arrays exist even if CLI returns partial data
      if (!result.filesChanged) result.filesChanged = [];
      setContext(result);
    } catch (e) {
      setContextError(String(e));
    } finally {
      setContextLoading(false);
    }
  }, [repoPath, base]);

  useEffect(() => {
    if (baseDetected && base) {
      loadContext();
    }
  }, [baseDetected, base, loadContext]);

  const generateWithAI = async () => {
    if (!repoPath) return;
    setGenerating(true);
    setCreateError(null);
    try {
      const result = await invoke<{ title: string; body: string }>("generate_pr", {
        repoPath,
        base: base,
      });
      setTitle(result.title);
      setBody(result.body);
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const createPr = async () => {
    if (!repoPath || !title) return;
    setCreating(true);
    setCreateError(null);
    try {
      const url = await invoke<string>("create_pr", {
        repoPath,
        title,
        body,
        base: base,
        draft,
      });
      setPrUrl(url);
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreating(false);
    }
  };

  if (!repoPath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Open a repository to get started.
      </div>
    );
  }

  // ─── Success screen ───────────────────────────────────────────────

  if (prUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="rounded-full bg-green-500/15 p-4">
          <GitPullRequest className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-lg font-semibold">Pull Request Created</h2>
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary underline underline-offset-4 hover:text-primary/80"
        >
          <ExternalLink className="h-4 w-4" />
          {prUrl}
        </a>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => {
            setPrUrl(null);
            setTitle("");
            setBody("");
            setContext(null);
            setCreateError(null);
          }}
        >
          Create Another
        </Button>
      </div>
    );
  }

  // ─── Intro screen (before context loads) ──────────────────────────

  if (!context && !contextLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
          <GitPullRequest className="h-8 w-8 text-brand" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold">Create Pull Request</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Generate a pull request with AI-powered title and description, or write your own.
          </p>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground max-w-xs">
          <div className="flex items-start gap-3">
            <Sparkles className="h-4 w-4 mt-0.5 text-brand shrink-0" />
            <span>AI-generated titles and descriptions from your diff</span>
          </div>
          <div className="flex items-start gap-3">
            <GitBranch className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
            <span>Auto-detects base branch from repo configuration</span>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
            <span>Summarizes commits and file changes before you submit</span>
          </div>
        </div>
        {contextError && (
          <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive max-w-xs">
            {contextError}
          </div>
        )}
        <Button onClick={loadContext} className="mt-2" disabled={contextLoading || !base}>
          {contextLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : !baseDetected ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {!baseDetected ? "Detecting base..." : "Load Context"}
        </Button>
      </div>
    );
  }

  // ─── Loading state ────────────────────────────────────────────────

  if (contextLoading && !context) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading PR context...
      </div>
    );
  }

  // ─── Main form ────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={400}>
    <div className="flex h-full flex-col">
      {/* Summary bar */}
      {context && (
        <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <span className="font-mono">{status?.branch ?? "HEAD"}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono">{base}</span>
          </span>
          <div className="flex items-center gap-2 ml-2 flex-wrap">
            <Badge variant="secondary">
              {context.commitCount} commit{context.commitCount === 1 ? "" : "s"}
            </Badge>
            <Badge variant="secondary">
              {context.filesChanged.length} file{context.filesChanged.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="safe" className="flex items-center gap-1">
              <Plus className="h-3 w-3" />
              {context.totalAdded}
            </Badge>
            <Badge variant="unsafe" className="flex items-center gap-1">
              <Minus className="h-3 w-3" />
              {context.totalRemoved}
            </Badge>
            {!context.onRemote && (
              <Badge variant="outline">not pushed</Badge>
            )}
            {context.onRemote && !context.upToDate && (
              <Badge variant="outline">
                {context.aheadCount} ahead
              </Badge>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={loadContext} disabled={contextLoading}>
                {contextLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh context</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Scrollable content */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 py-3 space-y-4">
          {/* Base branch */}
          <div className="flex items-center gap-3">
            <Label htmlFor="pr-base" className="text-xs font-semibold uppercase text-muted-foreground shrink-0">
              Base
            </Label>
            <input
              id="pr-base"
              type="text"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="main"
              className="flex h-8 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Context error */}
          {contextError && (
            <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {contextError}
            </div>
          )}

          {/* AI Generation */}
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={generateWithAI}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Generate with AI
                </Button>
              </TooltipTrigger>
              <TooltipContent>Generate PR title and body with AI</TooltipContent>
            </Tooltip>
            {generating && (
              <span className="text-xs text-muted-foreground">Generating title and body...</span>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="pr-title" className="text-xs font-semibold uppercase text-muted-foreground">
              Title
            </Label>
            <input
              id="pr-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="PR title"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="pr-body" className="text-xs font-semibold uppercase text-muted-foreground">
              Body
            </Label>
            <Textarea
              id="pr-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe your changes (markdown supported)..."
              className="min-h-[180px]"
            />
          </div>

          {/* Create error */}
          {createError && (
            <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {createError}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Sticky footer */}
      <div className="flex items-center justify-between border-t px-4 py-3 shrink-0 bg-background">
        <div className="flex items-center gap-3">
          <Switch id="draft-toggle" checked={draft} onCheckedChange={setDraft} />
          <Label htmlFor="draft-toggle" className="text-xs">Create as draft</Label>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={createPr} disabled={creating || !title} size="sm">
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitPullRequest className="mr-2 h-4 w-4" />
              )}
              Create Pull Request
            </Button>
          </TooltipTrigger>
          <TooltipContent>Submit pull request to remote</TooltipContent>
        </Tooltip>
      </div>
    </div>
    </TooltipProvider>
  );
}
