import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRepoPath } from "@/hooks/useRepo";
import { useTheme } from "@/hooks/useTheme";
import type { ConfigEntry } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

const CREDENTIAL_KEYS = ["anthropicApiKey", "githubToken", "bitbucketToken"];

function maskValue(key: string, value: unknown): string {
  if (value == null) return "—";
  const str = String(value);
  if (!CREDENTIAL_KEYS.includes(key)) return str;
  if (str.length <= 8) return "****";
  return str.slice(0, 8) + "****";
}

function sourceLabel(source: string): string {
  if (source.includes("credentials")) return "credentials";
  if (source.includes(".machete.env")) return "repo env";
  if (source.includes(".macheterc") && source.includes("~")) return "global";
  if (source.includes(".macheterc")) return "repo";
  if (source === "default" || source === "defaults") return "default";
  return source;
}

export function SettingsView() {
  const { repoPath } = useRepoPath();
  const { dark, toggle } = useTheme();
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ConfigEntry[]>("get_config_list", { repoPath });
      setEntries(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const protectedBranches = entries.find((e) => e.key === "protectedBranches");
  const branchList: string[] = Array.isArray(protectedBranches?.value)
    ? (protectedBranches.value as string[])
    : [];

  const configEntries = entries.filter((e) => e.key !== "protectedBranches");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-sm text-muted-foreground">
            View configuration and manage preferences.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchConfig} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      <Separator />

      {/* Theme toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="theme-toggle" className="text-sm">
              Dark mode
            </Label>
            <Switch id="theme-toggle" checked={dark} onCheckedChange={toggle} />
          </div>
        </CardContent>
      </Card>

      {/* Protected branches */}
      {branchList.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Protected Branches</CardTitle>
            <CardDescription>
              Branches that are never pruned or deleted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {branchList.map((branch) => (
                <Badge key={branch} variant="protected">
                  {branch}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Keyboard shortcuts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Keyboard Shortcuts</CardTitle>
          <CardDescription>
            Available shortcuts throughout the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {[
              { category: "Panels", shortcuts: [
                { keys: "⌘⇧P", action: "Pull Requests" },
                { keys: "⌘⇧B", action: "Branch Management" },
                { keys: "⌘⇧E", action: "Release" },
                { keys: "⌘,", action: "Settings" },
              ]},
              { category: "Git Operations", shortcuts: [
                { keys: "⌘⇧U", action: "Push" },
                { keys: "⌘⇧L", action: "Pull" },
                { keys: "⌘⇧F", action: "Fetch" },
                { keys: "⌘R", action: "Refresh active tab" },
                { keys: "⌘⇧R", action: "Refresh all tabs" },
              ]},
              { category: "Branches", shortcuts: [
                { keys: "⌘⇧N", action: "New branch" },
                { keys: "⌘⇧S", action: "Analyze branch safety" },
                { keys: "⌘⇧T", action: "Stash changes" },
              ]},
              { category: "Commit", shortcuts: [
                { keys: "⌘⇧C", action: "Toggle commit bar" },
                { keys: "⌘⇧A", action: "Generate AI commit message" },
                { keys: "⌘↵", action: "Submit commit / create PR" },
                { keys: "⌘⇧↵", action: "Commit & Push" },
              ]},
              { category: "Navigation", shortcuts: [
                { keys: "⌘↑", action: "Jump to top of history" },
                { keys: "⌘↓", action: "Jump to bottom of history" },
                { keys: "⇧↑ / ⇧↓", action: "Navigate commit history (global)" },
                { keys: "↑ / ↓", action: "Navigate files or commits (when panel focused)" },
              ]},
              { category: "Tabs", shortcuts: [
                { keys: "⌘T", action: "New tab" },
                { keys: "⌘W", action: "Close tab" },
                { keys: "⌘⇧[", action: "Previous tab" },
                { keys: "⌘⇧]", action: "Next tab" },
                { keys: "⌘1–⌘9", action: "Switch to tab by number" },
              ]},
              { category: "PR Editor", shortcuts: [
                { keys: "⌘⇧M", action: "Toggle markdown cheatsheet" },
              ]},
            ].map(({ category, shortcuts }) => (
              <div key={category} className="px-6 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{category}</div>
                <div className="space-y-1.5">
                  {shortcuts.map(({ keys, action }) => (
                    <div key={keys} className="flex items-center justify-between">
                      <span className="text-sm">{action}</span>
                      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Config table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuration</CardTitle>
          <CardDescription>
            Merged configuration from all sources.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="px-6 pb-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {!error && configEntries.length === 0 && !loading && (
            <div className="px-6 pb-6">
              <p className="text-sm text-muted-foreground">
                {repoPath ? "No configuration entries found." : "Open a repository to view configuration."}
              </p>
            </div>
          )}

          {configEntries.length > 0 && (
            <ScrollArea className="max-h-[400px]">
              <div className="divide-y">
                {configEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-center gap-4 px-6 py-3"
                  >
                    <span className="min-w-[180px] shrink-0 font-mono text-sm">
                      {entry.key}
                    </span>
                    <span className="flex-1 truncate font-mono text-sm text-muted-foreground">
                      {maskValue(entry.key, entry.value)}
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {sourceLabel(entry.source)}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
