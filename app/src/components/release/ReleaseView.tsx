import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Rocket,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Tag,
  GitBranch,
  AlertTriangle,
  Info,
} from "lucide-react";
import { useRepoPath, useStatus } from "@/hooks/useRepo";
import type { ReleasePreview } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

type BumpType = "patch" | "minor" | "major";

interface ReleaseViewProps {
  /** Whether the intro was already dismissed this session (survives sheet close/reopen) */
  introDismissed?: boolean;
  /** Callback to notify parent that the intro has been dismissed */
  onIntroDismissed?: () => void;
}

export function ReleaseView({ introDismissed, onIntroDismissed }: ReleaseViewProps) {
  const { repoPath } = useRepoPath();
  const { status } = useStatus();
  const [preview, setPreview] = useState<ReleasePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BumpType>("patch");
  const [copied, setCopied] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  // ── Intro splash control ────────────────────────────────────────────
  const skipIntroKey = `machete:skipReleaseIntro:${repoPath}`;
  const [skipIntro, setSkipIntro] = useState(() => {
    try { return localStorage.getItem(skipIntroKey) === "1"; } catch { return false; }
  });
  const [introVisible, setIntroVisible] = useState(!skipIntro && !introDismissed);

  const handleSkipIntroChange = (checked: boolean) => {
    setSkipIntro(checked);
    try {
      if (checked) localStorage.setItem(skipIntroKey, "1");
      else localStorage.removeItem(skipIntroKey);
    } catch { /* ignore */ }
  };

  const fetchPreview = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ReleasePreview>("get_release_preview", { repoPath });
      setPreview(result);
      setHasScanned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setHasScanned(true);
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  const dismissIntro = () => {
    setIntroVisible(false);
    onIntroDismissed?.();
    fetchPreview();
  };

  // Reset when repo changes
  useEffect(() => {
    setPreview(null);
    setHasScanned(false);
    setError(null);
    // Re-read skipIntro for new repo
    try {
      const skip = localStorage.getItem(`machete:skipReleaseIntro:${repoPath}`) === "1";
      setSkipIntro(skip);
      setIntroVisible(!skip && !introDismissed);
    } catch {
      setSkipIntro(false);
      setIntroVisible(!introDismissed);
    }
  }, [repoPath, introDismissed]);

  // Auto-load preview when skipIntro is true
  useEffect(() => {
    if (skipIntro && !hasScanned && !loading && repoPath) {
      fetchPreview();
    }
  }, [skipIntro, hasScanned, loading, repoPath, fetchPreview]);

  // Refresh when ⌘⇧R fires
  useEffect(() => {
    const unlisten = listen("refresh-all", () => { if (hasScanned) fetchPreview(); });
    return () => { unlisten.then((fn) => fn()); };
  }, [fetchPreview, hasScanned]);

  const command = `machete release ${selected}`;

  const copyCommand = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isOnDevelop = status?.branch === "develop";
  const isClean = status?.isClean ?? false;
  const canRelease = isOnDevelop && isClean;

  const bumpCards: { type: BumpType; label: string; description: string }[] = [
    { type: "patch", label: "Patch", description: "Bug fixes, no API changes" },
    { type: "minor", label: "Minor", description: "New features, backward compatible" },
    { type: "major", label: "Major", description: "Breaking changes" },
  ];

  if (!repoPath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Open a repository to get started.
      </div>
    );
  }

  // ─── Intro screen ──────────────────────────────────────────────

  if (introVisible) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
          <Rocket className="h-8 w-8 text-brand" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold">Release</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Preview version bumps and generate the CLI command to create a release.
          </p>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground max-w-xs">
          <div className="flex items-start gap-3">
            <Tag className="h-4 w-4 mt-0.5 text-brand shrink-0" />
            <span>Semantic versioning with patch, minor, and major bumps</span>
          </div>
          <div className="flex items-start gap-3">
            <GitBranch className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
            <span>Pre-flight checks for branch and working tree status</span>
          </div>
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
            <span>Safe by design — preview before you release</span>
          </div>
        </div>
        <Button onClick={dismissIntro} className="mt-2">
          <RefreshCw className="mr-2 h-4 w-4" />
          Load Preview
        </Button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox
            checked={skipIntro}
            onCheckedChange={(checked) => handleSkipIntroChange(!!checked)}
          />
          Don&apos;t show this again
        </label>
      </div>
    );
  }

  // ─── Loading ───────────────────────────────────────────────────

  if (loading && !preview) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading release preview...
      </div>
    );
  }

  // ─── Error-only state (no preview data) ────────────────────────

  if (error && !preview) {
    // Extract a friendly message from the raw CLI error
    const friendlyError = error.includes("ENOENT") && error.includes("package.json")
      ? "This repository doesn't have a package.json file. The release command requires a Node.js project with a package.json to manage versions."
      : error.includes("machete failed:")
        ? error.replace(/^machete failed:\s*/, "").split("\n")[0]
        : error;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center space-y-2 max-w-sm">
          <h2 className="text-lg font-semibold">Release Unavailable</h2>
          <p className="text-sm text-muted-foreground">{friendlyError}</p>
        </div>
        <Button variant="outline" onClick={fetchPreview}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  // ─── Main view ─────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full flex-col">
        {/* Summary bar */}
        <div className="px-4 py-3 border-b shrink-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Release</span>
            {preview && (
              <Badge variant="secondary" className="font-mono">
                v{preview.currentVersion}
              </Badge>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIntroVisible(true)}>
                    <Info className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>About Release</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchPreview} disabled={loading}>
                    {loading ? (
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
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs">
              {isOnDevelop ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              )}
              <span className="text-muted-foreground">{status?.branch ?? "unknown"}</span>
            </span>
            <span className="flex items-center gap-1 text-xs">
              {isClean ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              )}
              <span className="text-muted-foreground">{isClean ? "clean" : "dirty"}</span>
            </span>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-3 space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Version bump selector */}
            {preview && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                  Version Bump
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {bumpCards.map(({ type, label, description }) => (
                    <button
                      key={type}
                      className={`rounded-lg border p-3 text-left transition-colors hover:border-brand/50 ${
                        selected === type
                          ? "border-brand ring-1 ring-brand/20 bg-brand/5"
                          : "border-border"
                      }`}
                      onClick={() => setSelected(type)}
                    >
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{description}</div>
                      <div className="flex items-center gap-1.5 mt-2 text-xs">
                        <span className="font-mono text-muted-foreground">
                          {preview.currentVersion}
                        </span>
                        <span className="text-muted-foreground">&rarr;</span>
                        <span className="font-mono font-semibold">
                          {preview.versions[type]}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pre-flight checks detail */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                Pre-flight Checks
              </Label>
              <div className="rounded-md border divide-y">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm">On develop branch</span>
                  <Badge variant={isOnDevelop ? "safe" : "unsafe"} className="text-[10px]">
                    {status?.branch ?? "unknown"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm">Working tree clean</span>
                  <Badge variant={isClean ? "safe" : "unsafe"} className="text-[10px]">
                    {isClean ? "clean" : "dirty"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* CLI command */}
            {preview && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                  CLI Command
                </Label>
                <p className="text-xs text-muted-foreground">
                  Release is managed via the CLI. Copy the command below and run it from your terminal.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm truncate">
                    {command}
                  </code>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={copyCommand}
                        disabled={!canRelease}
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{copied ? "Copied!" : "Copy command"}</TooltipContent>
                  </Tooltip>
                </div>
                {!canRelease && (
                  <p className="text-xs text-muted-foreground">
                    Resolve the pre-flight checks above before running the release.
                  </p>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}

// Label is a simple inline component for section headers here
function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
