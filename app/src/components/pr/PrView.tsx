import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GitPullRequest,
  Loader2,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Plus,
  Minus,
} from "lucide-react";
import { useRepoPath, useStatus } from "@/hooks/useRepo";
import type { PrContext } from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

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
    if (!repoPath || !base) return;
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Create Pull Request</h2>
        <p className="text-sm text-muted-foreground">
          {status?.branch ? (
            <>
              Current branch: <span className="font-medium text-foreground">{status.branch}</span>
            </>
          ) : (
            "Load context to get started"
          )}
        </p>
      </div>

      {/* Base Branch */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Base Branch</CardTitle>
            <Button variant="ghost" size="sm" onClick={loadContext} disabled={contextLoading}>
              {contextLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="text"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="main"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {contextError && (
            <p className="text-sm text-destructive">{contextError}</p>
          )}
        </CardContent>
      </Card>

      {/* Context Summary */}
      {context && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Context Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Badge variant="secondary">
                {context.commitCount} commit{context.commitCount === 1 ? "" : "s"}
              </Badge>
              <Badge variant="secondary">
                {context.filesChanged.length} file{context.filesChanged.length === 1 ? "" : "s"} changed
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
                  {context.aheadCount} ahead of remote
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* AI Generation */}
      <div className="flex items-center gap-3">
        <Button
          variant="brand"
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
        {generating && (
          <span className="text-sm text-muted-foreground">Generating title and body...</span>
        )}
      </div>

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="pr-title">Title</Label>
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
      <div className="space-y-2">
        <Label htmlFor="pr-body">Body</Label>
        <Textarea
          id="pr-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe your changes (markdown supported)..."
          className="min-h-[200px]"
        />
      </div>

      {/* Draft Toggle */}
      <div className="flex items-center gap-3">
        <Switch id="draft-toggle" checked={draft} onCheckedChange={setDraft} />
        <Label htmlFor="draft-toggle">Create as draft</Label>
      </div>

      {createError && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{createError}</CardContent>
        </Card>
      )}

      <Separator />

      {/* Create Button */}
      <div className="flex justify-end">
        <Button onClick={createPr} disabled={creating || !title}>
          {creating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <GitPullRequest className="mr-2 h-4 w-4" />
          )}
          Create Pull Request
        </Button>
      </div>
    </div>
  );
}
