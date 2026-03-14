import { useMemo, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTabManager } from "@/hooks/useTabManager";
import { useKeyboardShortcuts, type ShortcutDef } from "@/hooks/useKeyboardShortcuts";
import { TabBar } from "@/components/layout/TabBar";
import { RepoTabContent } from "@/components/layout/RepoTabContent";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";
import logoSvg from "@/assets/machete-logo.svg";

function App() {
  const tabManager = useTabManager();
  const { tabs, activeTabId, openTab, closeTab, activateTab, reportTabStatus } = tabManager;

  const handleOpenRepo = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      openTab(selected);
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
            <h1 className="text-3xl font-bold tracking-tight">Machete</h1>
            <p className="text-muted-foreground">A sharp GUI for managing git repositories</p>
            <Button size="lg" onClick={handleOpenRepo} className="gap-2">
              <FolderOpen className="h-5 w-5" />
              Open Repository
            </Button>
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
