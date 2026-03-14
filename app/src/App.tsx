import { useMemo, useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTabManager } from "@/hooks/useTabManager";
import { useKeyboardShortcuts, type ShortcutDef } from "@/hooks/useKeyboardShortcuts";
import { TabBar } from "@/components/layout/TabBar";
import { RepoTabContent } from "@/components/layout/RepoTabContent";
import { Button } from "@/components/ui/button";
import { FolderOpen, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import logoSvg from "@/assets/machete-logo.svg";

interface HealthCheckResult {
  git: { installed: boolean; version: string | null };
  gh: { installed: boolean; version: string | null; authenticated: boolean };
  machete: { installed: boolean; version: string | null };
  node: { installed: boolean; version: string | null };
}

function HealthStatus({ ok, warn, label, detail }: { ok: boolean; warn?: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
      ) : warn ? (
        <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
      )}
      <span className={ok ? "text-foreground" : warn ? "text-yellow-500" : "text-muted-foreground"}>
        {label}
      </span>
      {detail && (
        <span className="text-muted-foreground">{detail}</span>
      )}
    </div>
  );
}

function App() {
  const tabManager = useTabManager();
  const { tabs, activeTabId, openTab, closeTab, activateTab, reportTabStatus } = tabManager;

  const handleOpenRepo = useCallback(async () => {
    const selected = await open({ directory: true, multiple: true });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const path of paths) {
      openTab(path);
    }
  }, [openTab]);

  /** Start native window drag on mousedown; double-click to toggle maximize */
  const handleDragMouseDown = useCallback(async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const appWindow = getCurrentWindow();
    if (e.detail === 2) {
      if (await appWindow.isMaximized()) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } else {
      await appWindow.startDragging();
    }
  }, []);

  // ── Tab keyboard shortcuts ──────────────────────────────────────
  const shortcuts = useMemo<ShortcutDef[]>(() => {
    const defs: ShortcutDef[] = [
      { key: "t", meta: true, handler: handleOpenRepo },                         // ⌘T — New tab
      { key: "w", meta: true, handler: () => { if (activeTabId) closeTab(activeTabId); } },  // ⌘W — Close tab
      { key: "[", meta: true, shift: true, handler: () => {                       // ⌘⇧[ — Previous tab
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        if (idx > 0) activateTab(tabs[idx - 1].id);
      }},
      { key: "]", meta: true, shift: true, handler: () => {                       // ⌘⇧] — Next tab
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        if (idx < tabs.length - 1) activateTab(tabs[idx + 1].id);
      }},
    ];

    // ⌘1–⌘9 — Switch to tab by index
    for (let i = 1; i <= 9; i++) {
      const n = i;
      defs.push({
        key: String(n),
        meta: true,
        handler: () => {
          const target = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
          if (target) activateTab(target.id);
        },
      });
    }

    return defs;
  }, [tabs, activeTabId, closeTab, activateTab, handleOpenRepo]);
  useKeyboardShortcuts(shortcuts);

  const hasTabs = tabs.length > 0;

  // Health check state — only fetched on the welcome screen
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    if (hasTabs) return;
    let cancelled = false;
    setHealthLoading(true);
    invoke<HealthCheckResult>("health_check")
      .then((result) => { if (!cancelled) setHealth(result); })
      .catch(() => { if (!cancelled) setHealth(null); })
      .finally(() => { if (!cancelled) setHealthLoading(false); });
    return () => { cancelled = true; };
  }, [hasTabs]);

  // Welcome screen when no tabs are open
  if (!hasTabs) {
    return (
      <div className="flex h-screen w-screen flex-col bg-background">
        {/* Draggable title bar area */}
        <div
          className="h-9 shrink-0 flex items-center pl-[84px]"
          onMouseDown={handleDragMouseDown}
        >
          <img src={logoSvg} alt="Machete" className="h-4 w-4 rounded-sm pointer-events-none" />
          <span className="ml-1.5 text-sm font-bold tracking-tight pointer-events-none">Machete</span>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center">
            <img src={logoSvg} alt="Machete" className="h-20 w-20 rounded-xl" />
            <h1 className="text-4xl font-extrabold tracking-tight">Machete</h1>
            <p className="text-muted-foreground">A sharp GUI for managing git repositories</p>
            <Button size="lg" onClick={handleOpenRepo} className="gap-2 bg-brand hover:bg-brand/90 text-white">
              <FolderOpen className="h-5 w-5" />
              Open Repositories
            </Button>

            {/* Health check status */}
            <div className="mt-4 flex flex-col gap-2 items-start rounded-lg border border-border bg-card px-5 py-4">
              {healthLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking environment…
                </div>
              ) : health ? (
                <>
                  <HealthStatus
                    ok={!!health.git.installed}
                    label="Git"
                    detail={health.git.version ? `v${health.git.version}` : "not found"}
                  />
                  <HealthStatus
                    ok={!!health.node.installed}
                    label="Node.js"
                    detail={health.node.version ? `v${health.node.version}` : "not found"}
                  />
                  <HealthStatus
                    ok={!!health.machete.installed}
                    label="Machete CLI"
                    detail={health.machete.version ? `v${health.machete.version}` : "not installed"}
                  />
                  <HealthStatus
                    ok={!!health.gh.authenticated}
                    warn={health.gh.installed && !health.gh.authenticated}
                    label="GitHub"
                    detail={
                      health.gh.authenticated
                        ? "authenticated"
                        : health.gh.installed
                          ? "not authenticated — run gh auth login"
                          : "gh CLI not found"
                    }
                  />
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Unable to check environment
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      {/* Tab bar */}
      <TabBar tabManager={tabManager} />

      {/* Tab content area — all tabs rendered, only active is visible */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {tabs.map((tab) => (
          <RepoTabContent
            key={tab.id}
            tabId={tab.id}
            repoPath={tab.repoPath}
            isActive={tab.id === activeTabId}
            onStatusReport={reportTabStatus}
          />
        ))}
      </div>
    </div>
  );
}

export default App;
