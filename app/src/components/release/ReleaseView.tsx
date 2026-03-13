import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRepo } from "@/hooks/useRepo";
import type { ReleasePreview } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type BumpType = "patch" | "minor" | "major";

export function ReleaseView() {
  const { repoPath, status } = useRepo();
  const [preview, setPreview] = useState<ReleasePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BumpType>("patch");
  const [copied, setCopied] = useState(false);

  const fetchPreview = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ReleasePreview>("get_release_preview", { repoPath });
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Release</h2>
        <p className="text-sm text-muted-foreground">
          Preview version bumps and generate the CLI command to run.
        </p>
      </div>

      <Separator />

      {/* Status indicators */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pre-flight Checks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Must be on develop branch</span>
            <Badge variant={isOnDevelop ? "safe" : "unsafe"}>
              {status?.branch ?? "unknown"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Working tree must be clean</span>
            <Badge variant={isClean ? "safe" : "unsafe"}>
              {isClean ? "clean" : "dirty"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Version bump cards */}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading version preview...</p>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {preview && (
        <div className="grid grid-cols-3 gap-4">
          {bumpCards.map(({ type, label, description }) => (
            <Card
              key={type}
              className={`cursor-pointer transition-colors hover:border-primary/50 ${
                selected === type
                  ? "border-2 border-primary ring-1 ring-primary/20"
                  : ""
              }`}
              onClick={() => setSelected(type)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{label}</CardTitle>
                <CardDescription className="text-xs">{description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-muted-foreground">
                    {preview.currentVersion}
                  </span>
                  <span className="text-muted-foreground">&rarr;</span>
                  <span className="font-mono font-semibold">
                    {preview.versions[type]}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Separator />

      {/* CLI command */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">CLI Command</CardTitle>
          <CardDescription>
            Release is managed via the CLI. Select a version bump and run from terminal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <code className="flex-1 rounded-md bg-muted px-4 py-2 font-mono text-sm">
              {command}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={copyCommand}
              disabled={!canRelease}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          {!canRelease && (
            <p className="mt-2 text-xs text-muted-foreground">
              Resolve the pre-flight checks above before running the release.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
