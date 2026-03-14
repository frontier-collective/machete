import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GitPullRequest,
  GitBranch,
  Loader2,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Plus,
  Minus,
  ArrowRight,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  CircleDot,
  Eye,
  ChevronDown,
  ChevronRight,
  Shield,
  Search,
  HelpCircle,
  X,
} from "lucide-react";
import { useRepoPath, useStatus, useRepoMetadata } from "@/hooks/useRepo";
import { useKeyboardShortcuts, type ShortcutDef } from "@/hooks/useKeyboardShortcuts";
import type { PrContext, GithubPr, RemoteInfo } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

type ViewState = "intro" | "list" | "create";
type BodyTab = "edit" | "preview";

export function PrView() {
  const { repoPath } = useRepoPath();
  const { status } = useStatus();
  const { defaultBranch, protectedBranches: metadataProtected } = useRepoMetadata();

  // View navigation
  const [view, setView] = useState<ViewState>("intro");

  // Existing PRs
  const [prs, setPrs] = useState<GithubPr[]>([]);
  const [prsLoading, setPrsLoading] = useState(false);
  const [prsError, setPrsError] = useState<string | null>(null);

  // PR creation form
  const [base, setBase] = useState("");
  const [baseDetected, setBaseDetected] = useState(false);
  const [context, setContext] = useState<PrContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  // Base branch selector
  const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
  const protectedBranches = metadataProtected;
  const [baseMenuOpen, setBaseMenuOpen] = useState(false);
  const [baseFilter, setBaseFilter] = useState("");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);

  const [bodyTab, setBodyTab] = useState<BodyTab>("edit");
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  // Track whether we've already auto-fetched PRs this mount
  const hasFetchedPrs = useRef(false);
  // Track whether context has been loaded at least once
  const hasLoadedContext = useRef(false);

  // ⌘⇧M — Markdown cheatsheet
  const cheatsheetShortcuts = useMemo<ShortcutDef[]>(
    () => [
      { key: "m", meta: true, shift: true, handler: () => setCheatsheetOpen((prev) => !prev) },
    ],
    []
  );
  useKeyboardShortcuts(cheatsheetShortcuts);

  // ─── Fetch existing PRs ──────────────────────────────────────────

  const fetchPrs = useCallback(async () => {
    if (!repoPath) return;
    setPrsLoading(true);
    setPrsError(null);
    try {
      const result = await invoke<GithubPr[]>("list_prs", { repoPath });
      setPrs(result);
    } catch (e) {
      setPrsError(String(e));
    } finally {
      setPrsLoading(false);
    }
  }, [repoPath]);

  // Auto-fetch PRs in the background on mount
  useEffect(() => {
    if (!repoPath || hasFetchedPrs.current) return;
    hasFetchedPrs.current = true;
    fetchPrs();
  }, [repoPath, fetchPrs]);

  // Reset when repo changes
  useEffect(() => {
    hasFetchedPrs.current = false;
    hasLoadedContext.current = false;
    setView("intro");
    setPrs([]);
    setPrsError(null);
    setContext(null);
    setBase("");
    setBaseDetected(false);
    setTitle("");
    setBody("");
    setPrUrl(null);
    setRemoteBranches([]);
  }, [repoPath]);

  // ─── Fetch remote branches (for base selector) ─────────────────

  useEffect(() => {
    if (!repoPath) return;
    invoke<RemoteInfo[]>("get_remotes", { repoPath }).then((remotes) => {
      // Flatten remote branches, strip remote prefix (origin/main → main)
      const branches: string[] = [];
      const seen = new Set<string>();
      for (const remote of remotes) {
        for (const fullRef of remote.branches) {
          // fullRef is like "origin/main" — strip the "origin/" prefix
          const shortName = fullRef.startsWith(`${remote.name}/`)
            ? fullRef.slice(remote.name.length + 1)
            : fullRef;
          if (!seen.has(shortName)) {
            seen.add(shortName);
            branches.push(shortName);
          }
        }
      }
      setRemoteBranches(branches);
    }).catch(() => {});
  }, [repoPath]);

  // ─── PR context + creation logic ────────────────────────────────

  // Set base branch from pre-loaded metadata (runs as soon as defaultBranch is available)
  useEffect(() => {
    if (!repoPath || baseDetected || !defaultBranch) return;
    setBase(defaultBranch);
    setBaseDetected(true);
  }, [repoPath, baseDetected, defaultBranch]);

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
      const result = await invoke<PrContext>("get_pr_context", { repoPath, base });
      if (!result.filesChanged) result.filesChanged = [];
      setContext(result);
      hasLoadedContext.current = true;
    } catch (e) {
      setContextError(String(e));
    } finally {
      setContextLoading(false);
    }
  }, [repoPath, base]);

  // Auto-load context once base is detected (runs in background even before create view)
  useEffect(() => {
    if (baseDetected && base && !hasLoadedContext.current) {
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
        base,
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
        base,
        draft,
      });
      setPrUrl(url);
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreating(false);
    }
  };

  // ─── Base branch selector helpers ───────────────────────────────

  // Sort: protected first, then alphabetical
  const sortedRemoteBranches = useMemo(() => {
    const filtered = baseFilter
      ? remoteBranches.filter((b) => b.toLowerCase().includes(baseFilter.toLowerCase()))
      : remoteBranches;
    return [...filtered].sort((a, b) => {
      const aProtected = protectedBranches.includes(a) ? 0 : 1;
      const bProtected = protectedBranches.includes(b) ? 0 : 1;
      if (aProtected !== bProtected) return aProtected - bProtected;
      return a.localeCompare(b);
    });
  }, [remoteBranches, protectedBranches, baseFilter]);

  const handleSelectBase = (branch: string) => {
    setBase(branch);
    setBaseMenuOpen(false);
    // Context will need manual refresh since base changed
  };

  // ─── Helpers ────────────────────────────────────────────────────

  const currentBranchPr = prs.find((pr) => pr.headRefName === status?.branch);

  const resetCreate = () => {
    setPrUrl(null);
    setTitle("");
    setBody("");
    setContext(null);
    setContextError(null);
    setCreateError(null);
    setBaseDetected(false);
    hasLoadedContext.current = false;
  };

  // ─── No repo ───────────────────────────────────────────────────

  if (!repoPath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Open a repository to get started.
      </div>
    );
  }

  // ─── Success screen ────────────────────────────────────────────

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
        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => {
              resetCreate();
              setView("list");
              fetchPrs();
            }}
          >
            View All PRs
          </Button>
          <Button
            onClick={() => {
              resetCreate();
              setView("create");
            }}
          >
            Create Another
          </Button>
        </div>
      </div>
    );
  }

  // ─── Intro screen ──────────────────────────────────────────────

  if (view === "intro") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
          <GitPullRequest className="h-8 w-8 text-brand" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold">Pull Requests</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            View open pull requests for this repository, or create a new one with AI-powered descriptions.
          </p>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground max-w-xs">
          <div className="flex items-start gap-3">
            <Eye className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
            <span>View open PRs with status, reviews, and change stats</span>
          </div>
          <div className="flex items-start gap-3">
            <Sparkles className="h-4 w-4 mt-0.5 text-brand shrink-0" />
            <span>AI-generated titles and descriptions from your diff</span>
          </div>
          <div className="flex items-start gap-3">
            <GitBranch className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
            <span>Auto-detects base branch from repo configuration</span>
          </div>
        </div>

        {/* Current branch PR hint */}
        {currentBranchPr && (
          <div className="rounded-md border bg-muted/50 px-4 py-2.5 max-w-xs w-full">
            <div className="flex items-center gap-2 text-xs">
              <CircleDot className="h-3.5 w-3.5 text-green-500 shrink-0" />
              <span className="font-medium truncate">#{currentBranchPr.number} {currentBranchPr.title}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              This branch already has an open PR
            </p>
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <Button variant="outline" onClick={() => setView("list")}>
            <Eye className="mr-2 h-4 w-4" />
            View PRs{prs.length > 0 ? ` (${prs.length})` : ""}
          </Button>
          <Button onClick={() => setView("create")}>
            <Plus className="mr-2 h-4 w-4" />
            New PR
          </Button>
        </div>

        {/* Loading spinner for background PR fetch — below buttons */}
        {prsLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Scanning for open PRs...
          </div>
        )}

        {/* PR count badge if loaded */}
        {!prsLoading && prs.length > 0 && !currentBranchPr && (
          <div className="text-xs text-muted-foreground">
            {prs.length} open PR{prs.length === 1 ? "" : "s"} in this repo
          </div>
        )}

        {prsError && (
          <div className="rounded-md bg-destructive/10 px-4 py-2 text-xs text-destructive max-w-xs">
            {prsError}
          </div>
        )}
      </div>
    );
  }

  // ─── PR list view ──────────────────────────────────────────────

  if (view === "list") {
    return (
      <TooltipProvider delayDuration={400}>
        <div className="flex h-full flex-col">
          {/* Summary bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Open Pull Requests</span>
            <Badge variant="secondary">{prs.length}</Badge>
            <div className="ml-auto flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchPrs} disabled={prsLoading}>
                    {prsLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* PR list */}
          <ScrollArea className="flex-1 min-h-0">
            {prsError && (
              <div className="mx-4 mt-3 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
                {prsError}
              </div>
            )}
            {!prsLoading && prs.length === 0 && !prsError && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                <GitPullRequest className="h-8 w-8 opacity-30" />
                <span className="text-sm">No open pull requests</span>
              </div>
            )}
            <div className="divide-y">
              {prs.map((pr) => (
                <PrRow key={pr.number} pr={pr} isCurrentBranch={pr.headRefName === status?.branch} />
              ))}
            </div>
          </ScrollArea>

          {/* Footer: create new */}
          <div className="flex items-center justify-between border-t px-4 py-3 shrink-0 bg-background">
            <Button variant="ghost" size="sm" onClick={() => setView("intro")}>
              Back
            </Button>
            <Button size="sm" onClick={() => setView("create")}>
              <Plus className="mr-2 h-4 w-4" />
              New Pull Request
            </Button>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  // ─── Create view ───────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full flex-col">
        {/* Summary bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0 flex-wrap">
          <Button variant="ghost" size="sm" className="h-7 px-2 mr-1" onClick={() => { resetCreate(); setView("intro"); }}>
            Back
          </Button>
          {contextLoading && !context && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading context...
            </span>
          )}
        {context && (
          <>

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
          </>
        )}
        </div>

        {/* Top fields (non-scrolling) */}
        <div className="px-4 py-3 space-y-3 shrink-0">
          {/* Current branch already has a PR warning */}
          {currentBranchPr && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <CircleDot className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  This branch already has an open PR
                </p>
                <a
                  href={currentBranchPr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-600 dark:text-amber-300 underline underline-offset-2 hover:opacity-80"
                >
                  #{currentBranchPr.number}: {currentBranchPr.title}
                </a>
              </div>
            </div>
          )}

          {/* Base branch selector */}
          <div className="flex items-center gap-3">
            <Label className="text-xs font-semibold uppercase text-muted-foreground shrink-0">
              Base
            </Label>
            <Popover open={baseMenuOpen} onOpenChange={setBaseMenuOpen}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 h-8 px-3 rounded-md border bg-background text-sm hover:bg-muted/50 transition-colors flex-1 min-w-0">
                  {base && protectedBranches.includes(base) && (
                    <Shield className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  )}
                  <span className="truncate font-mono text-left flex-1">{base || "Select base branch..."}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start" sideOffset={4}>
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <input
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    placeholder="Filter branches..."
                    value={baseFilter}
                    onChange={(e) => setBaseFilter(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {sortedRemoteBranches.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {remoteBranches.length === 0 ? "Loading..." : "No matching branches"}
                    </div>
                  ) : (
                    sortedRemoteBranches.map((branch) => (
                      <button
                        key={branch}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                        onClick={() => handleSelectBase(branch)}
                      >
                        {protectedBranches.includes(branch) ? (
                          <Shield className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                        ) : (
                          <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate font-mono">{branch}</span>
                        {branch === base && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500 ml-auto" />
                        )}
                      </button>
                    ))
                  )}
                </div>
                {/* Manual entry fallback */}
                <div className="border-t px-3 py-2">
                  <Input
                    type="text"
                    value={base}
                    onChange={(e) => setBase(e.target.value)}
                    placeholder="Or type a branch name..."
                    className="h-7 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setBaseMenuOpen(false);
                    }}
                  />
                </div>
              </PopoverContent>
            </Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={loadContext} disabled={contextLoading || !base}>
                  {contextLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reload context for this base</TooltipContent>
            </Tooltip>
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
            <Input
              id="pr-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="PR title"
            />
          </div>

          {/* Create error */}
          {createError && (
            <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {createError}
            </div>
          )}
        </div>

        {/* Body — fills remaining space */}
        <div className="flex flex-1 flex-col min-h-0 px-4 pb-3">
          {/* Tabs */}
          <div className="flex items-center gap-0 border-b mb-0 shrink-0">
            <button
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                bodyTab === "edit"
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setBodyTab("edit")}
            >
              Edit
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                bodyTab === "preview"
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setBodyTab("preview")}
            >
              Preview
            </button>
          </div>

          {bodyTab === "edit" ? (
            <Textarea
              id="pr-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const target = e.currentTarget;
                  const start = target.selectionStart;
                  const end = target.selectionEnd;
                  const indent = "    ";
                  const newValue = body.slice(0, start) + indent + body.slice(end);
                  setBody(newValue);
                  // Restore cursor position after React re-render
                  requestAnimationFrame(() => {
                    target.selectionStart = target.selectionEnd = start + indent.length;
                  });
                }
              }}
              placeholder="Describe your changes (markdown supported)..."
              className="flex-1 min-h-0 resize-none rounded-t-none border-t-0 font-mono text-sm"
            />
          ) : (
            <ScrollArea className="flex-1 min-h-0 rounded-md border border-t-0 rounded-t-none">
              <div className="p-3">
                {body ? (
                  <MarkdownPreview body={body} onBodyChange={setBody} />
                ) : (
                  <p className="text-sm text-muted-foreground italic">Nothing to preview</p>
                )}
              </div>
            </ScrollArea>
          )}

          {/* Markdown cheatsheet hint */}
          <div className="flex items-center justify-end pt-1 shrink-0">
            <button
              onClick={() => setCheatsheetOpen(true)}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <HelpCircle className="h-3 w-3" />
              Markdown Help
              <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px] leading-none">⌘⇧M</kbd>
            </button>
          </div>
        </div>

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

      {/* Markdown cheatsheet dialog */}
      <MarkdownCheatsheet open={cheatsheetOpen} onOpenChange={setCheatsheetOpen} />
    </TooltipProvider>
  );
}

// ─── Markdown cheatsheet dialog ─────────────────────────────────────

function MarkdownCheatsheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const rows: { syntax: string; result: string }[] = [
    { syntax: "# Heading 1", result: "H1 heading" },
    { syntax: "## Heading 2", result: "H2 heading" },
    { syntax: "### Heading 3", result: "H3 heading" },
    { syntax: "**bold**", result: "Bold text" },
    { syntax: "*italic*", result: "Italic text" },
    { syntax: "~~strikethrough~~", result: "Strikethrough" },
    { syntax: "`inline code`", result: "Inline code" },
    { syntax: "```code block```", result: "Code block" },
    { syntax: "[text](url)", result: "Link" },
    { syntax: "- item", result: "Bullet list" },
    { syntax: "1. item", result: "Numbered list" },
    { syntax: "- [ ] task", result: "Task (unchecked)" },
    { syntax: "- [x] task", result: "Task (checked)" },
    { syntax: "> quote", result: "Blockquote" },
    { syntax: "---", result: "Horizontal rule" },
  ];

  const panelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Load saved position from localStorage, or default to left of the PR body area.
  // The PR sheet occupies roughly the right half; place the cheatsheet just left of it.
  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem("machete:cheatsheet-pos");
      if (saved) return JSON.parse(saved) as { x: number; y: number };
    } catch { /* ignore */ }
    // Default: center the cheatsheet (w=288px) in the left half of the viewport
    const halfW = Math.floor(window.innerWidth / 2);
    return { x: Math.max(16, halfW - 320), y: 200 };
  });

  // Save position to localStorage on change (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem("machete:cheatsheet-pos", JSON.stringify(pos));
      } catch { /* ignore */ }
    }, 300);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [pos]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 300, e.clientX - dragStart.current.x)),
      y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragStart.current.y)),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-72 rounded-lg border bg-background shadow-lg"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b cursor-grab active:cursor-grabbing select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div>
          <h3 className="text-sm font-semibold">Markdown Cheatsheet</h3>
          <p className="text-[10px] text-muted-foreground">Drag to move</p>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onOpenChange(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="divide-y">
        {rows.map(({ syntax, result }) => (
          <div key={syntax} className="flex items-center gap-3 px-3 py-1">
            <code className="flex-1 text-xs font-mono text-muted-foreground">{syntax}</code>
            <span className="text-xs text-foreground shrink-0">{result}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Markdown preview with interactive checkboxes ───────────────────

/**
 * Find the checkbox bracket `[ ]` or `[x]` for a task list item given the
 * line offset from the mdast node position.  We search forward from the
 * start of the line for a GFM task list pattern: `- [ ]`, `* [x]`, etc.
 */
function findCheckboxInLine(body: string, lineOffset: number): number | null {
  // Extract from lineOffset to the next newline (or end)
  const nl = body.indexOf("\n", lineOffset);
  const line = body.slice(lineOffset, nl === -1 ? undefined : nl);
  // Match: optional whitespace, list marker (- * +), space, then [ ] or [x]
  const m = line.match(/^(\s*[-*+]\s)\[([ xX])\]/);
  if (!m) return null;
  return lineOffset + m[1].length;
}

function MarkdownPreview({ body, onBodyChange }: { body: string; onBodyChange: (v: string) => void }) {
  const toggleAtOffset = useCallback((offset: number) => {
    const pos = findCheckboxInLine(body, offset);
    if (pos == null) return;
    const current = body[pos + 1];
    const replacement = (current === " ") ? "[x]" : "[ ]";
    onBodyChange(body.slice(0, pos) + replacement + body.slice(pos + 3));
  }, [body, onBodyChange]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components = useMemo(() => ({
    // Use the `li` component — the hast `li` node has reliable position info
    // from the mdast AST. We detect task list items via className and read
    // the checked state from the source text at the node's offset.
    li: ({ node, children, ...props }: any) => {
      const classNames = node?.properties?.className;
      const isTask = Array.isArray(classNames)
        ? classNames.includes("task-list-item")
        : false;

      if (!isTask) {
        return <li {...props}>{children}</li>;
      }

      // Get source offset from the hast node position (patched from mdast)
      const offset = node?.position?.start?.offset;
      if (offset == null) {
        return <li {...props}>{children}</li>;
      }

      // Read checked state directly from the source text at this offset
      const bracketPos = findCheckboxInLine(body, offset);
      const isChecked = bracketPos != null && body[bracketPos + 1] !== " ";

      // Filter out the default <input> checkbox that remark-gfm inserts
      // so we can replace it with our own Checkbox component
      const filteredChildren = Array.isArray(children)
        ? children.filter((child: any) => {
            // Skip the synthesized <input type="checkbox"> and trailing space
            if (child?.type === "input" && child?.props?.type === "checkbox") return false;
            // Skip the space text node right after the checkbox
            if (typeof child === "string" && child === " ") return false;
            return true;
          })
        : children;

      return (
        <li className="task-list-item flex items-start gap-1.5 !list-none !pl-0">
          <Checkbox
            checked={isChecked}
            onCheckedChange={() => toggleAtOffset(offset)}
            className="mt-0.5 shrink-0"
          />
          <span>{filteredChildren}</span>
        </li>
      );
    },
  }), [toggleAtOffset, body]);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-code:text-xs [&_.contains-task-list]:list-none [&_.contains-task-list]:pl-0">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}

// ─── PR row component ──────────────────────────────────────────────

function PrRow({ pr, isCurrentBranch }: { pr: GithubPr; isCurrentBranch: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const reviewIcon = () => {
    switch (pr.reviewDecision) {
      case "APPROVED":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case "CHANGES_REQUESTED":
        return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case "REVIEW_REQUIRED":
        return <Eye className="h-3.5 w-3.5 text-amber-500" />;
      default:
        return null;
    }
  };

  const reviewLabel = () => {
    switch (pr.reviewDecision) {
      case "APPROVED": return "Approved";
      case "CHANGES_REQUESTED": return "Changes requested";
      case "REVIEW_REQUIRED": return "Review required";
      default: return null;
    }
  };

  const timeAgo = (dateStr: string): string => {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  const commentCount = Array.isArray(pr.comments) ? pr.comments.length : 0;

  return (
    <div className="px-4 py-2.5 hover:bg-muted/30 transition-colors">
      {/* Main row */}
      <button
        className="flex w-full items-start gap-2 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="mt-0.5 shrink-0">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
        <CircleDot className={`h-4 w-4 mt-0.5 shrink-0 ${pr.isDraft ? "text-muted-foreground" : "text-green-500"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{pr.title}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">#{pr.number}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground font-mono">
              {pr.headRefName}
            </span>
            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground font-mono">
              {pr.baseRefName}
            </span>
            {isCurrentBranch && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">current</Badge>
            )}
            {pr.isDraft && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">draft</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {reviewIcon()}
          {commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              {commentCount}
            </span>
          )}
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {timeAgo(pr.updatedAt)}
          </span>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="ml-[22px] mt-2 space-y-2 pb-1">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-muted-foreground">by <span className="font-medium text-foreground">{pr.author.login}</span></span>
            <span className="text-muted-foreground/40">|</span>
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <Plus className="h-3 w-3" />{pr.additions}
            </span>
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <Minus className="h-3 w-3" />{pr.deletions}
            </span>
            <span className="text-muted-foreground">
              {pr.changedFiles} file{pr.changedFiles === 1 ? "" : "s"}
            </span>
            {reviewLabel() && (
              <>
                <span className="text-muted-foreground/40">|</span>
                <span className="flex items-center gap-1">
                  {reviewIcon()}
                  <span className="text-muted-foreground">{reviewLabel()}</span>
                </span>
              </>
            )}
          </div>
          {pr.labels.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {pr.labels.map((label) => (
                <Badge
                  key={label.name}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-4"
                  style={{
                    borderColor: `#${label.color}`,
                    color: `#${label.color}`,
                  }}
                >
                  {label.name}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-2"
            >
              <ExternalLink className="h-3 w-3" />
              View on GitHub
            </a>
            <span className="text-[10px] text-muted-foreground">
              opened {timeAgo(pr.createdAt)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
