import { useState, useCallback, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Plus, X } from "lucide-react";
import type { TabManager } from "@/hooks/useTabManager";
import logoSvg from "@/assets/machete-logo.svg";

interface TabBarProps {
  tabManager: TabManager;
}

export function TabBar({ tabManager }: TabBarProps) {
  const { tabs, activeTabId, openTab, closeTab, closeOtherTabs, closeAllTabs, activateTab, moveTab } = tabManager;

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  // Pointer-based drag — all mutable state in a single ref to avoid stale closures
  const dragRef = useRef<{
    tabId: string;
    startX: number;
    fromIndex: number;
    tabRects: DOMRect[];
    started: boolean;
  } | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Keep a ref to the latest tabs & moveTab so event listeners always see current values
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const moveTabRef = useRef(moveTab);
  moveTabRef.current = moveTab;

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  }, []);

  const handleNewTab = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      openTab(selected);
    }
  }, [openTab]);

  const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  }, [closeTab]);

  // ── Compute drop target from cursor position ─────────────────────
  function calcDropTarget(ds: NonNullable<typeof dragRef.current>, clientX: number): number {
    const delta = clientX - ds.startX;
    const dragRect = ds.tabRects[ds.fromIndex];
    const dragCenter = dragRect.left + dragRect.width / 2 + delta;
    let target = ds.fromIndex;

    for (let i = 0; i < ds.tabRects.length; i++) {
      const r = ds.tabRects[i];
      const center = r.left + r.width / 2;
      if (i < ds.fromIndex && dragCenter < center) {
        target = i;
        break;
      }
      if (i > ds.fromIndex && dragCenter > center) {
        target = i;
      }
    }

    return target;
  }

  // ── Pointer-based drag handlers ───────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent, tabId: string, index: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;

    // Snapshot all tab rects
    const currentTabs = tabsRef.current;
    const rects: DOMRect[] = currentTabs.map((t) => {
      const el = tabRefs.current.get(t.id);
      return el ? el.getBoundingClientRect() : new DOMRect();
    });

    dragRef.current = {
      tabId,
      startX: e.clientX,
      fromIndex: index,
      tabRects: rects,
      started: false,
    };

    const onPointerMove = (ev: PointerEvent) => {
      const ds = dragRef.current;
      if (!ds) return;

      const delta = ev.clientX - ds.startX;

      // 4px dead zone before starting drag
      if (!ds.started && Math.abs(delta) < 4) return;
      ds.started = true;

      setDraggingTabId(ds.tabId);
      setDragDeltaX(delta);

      const target = calcDropTarget(ds, ev.clientX);
      setDropTargetIndex(target !== ds.fromIndex ? target : null);
    };

    const onPointerUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      const ds = dragRef.current;
      dragRef.current = null;
      setDraggingTabId(null);
      setDragDeltaX(0);
      setDropTargetIndex(null);

      if (ds?.started) {
        const target = calcDropTarget(ds, ev.clientX);
        if (target !== ds.fromIndex) {
          moveTabRef.current(ds.fromIndex, target);
        }
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, []);

  /** Extract directory name from full path */
  function repoName(path: string): string {
    const parts = path.replace(/\/$/, "").split("/");
    return parts[parts.length - 1] || path;
  }

  // Context menu actions
  const handleCopyPath = useCallback(() => {
    if (!contextMenu) return;
    const tab = tabs.find((t) => t.id === contextMenu.tabId);
    if (tab) navigator.clipboard.writeText(tab.repoPath);
    setContextMenu(null);
  }, [contextMenu, tabs]);

  const handleMoveLeft = useCallback(() => {
    if (!contextMenu) return;
    const idx = tabs.findIndex((t) => t.id === contextMenu.tabId);
    if (idx > 0) moveTab(idx, idx - 1);
    setContextMenu(null);
  }, [contextMenu, tabs, moveTab]);

  const handleMoveRight = useCallback(() => {
    if (!contextMenu) return;
    const idx = tabs.findIndex((t) => t.id === contextMenu.tabId);
    if (idx < tabs.length - 1) moveTab(idx, idx + 1);
    setContextMenu(null);
  }, [contextMenu, tabs, moveTab]);

  if (tabs.length === 0) return null;

  return (
    <>
      <div className="flex h-9 items-center border-b bg-background/80 shrink-0 select-none overflow-x-auto pl-[78px]"
        data-tauri-drag-region=""
      >
        {/* Logo */}
        <div className="flex items-center shrink-0 px-2">
          <img src={logoSvg} alt="Machete" className="h-4 w-4 rounded-sm" />
        </div>

        {/* Tabs */}
        <div className="flex items-center min-w-0 flex-1">
          {tabs.map((tab, index) => {
            const isActive = tab.id === activeTabId;
            const isDragging = draggingTabId === tab.id;
            const isDropTarget = dropTargetIndex === index && !isDragging;

            return (
              <div
                key={tab.id}
                ref={(el) => { if (el) tabRefs.current.set(tab.id, el); else tabRefs.current.delete(tab.id); }}
                className={`group relative flex items-center gap-1.5 px-3 h-9 text-xs cursor-pointer border-r border-border/50 max-w-[200px] min-w-[100px] ${
                  isActive
                    ? "bg-background text-foreground"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                } ${isDragging ? "opacity-60 z-50 shadow-lg" : ""} ${isDropTarget ? "ring-2 ring-inset ring-brand" : ""}`}
                style={isDragging ? { transform: `translateX(${dragDeltaX}px)`, transition: "none" } : undefined}
                onClick={() => { if (!draggingTabId) activateTab(tab.id); }}
                onContextMenu={(e) => handleContextMenu(e, tab.id)}
                onPointerDown={(e) => handlePointerDown(e, tab.id, index)}
                title={tab.repoPath}
              >
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
                )}

                <span className="truncate flex-1 font-medium">
                  {repoName(tab.repoPath)}
                </span>

                <button
                  className={`shrink-0 rounded p-0.5 hover:bg-foreground/10 transition-colors ${
                    isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
                  }`}
                  onClick={(e) => handleCloseTab(e, tab.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {/* New tab button */}
          <button
            className="flex items-center justify-center h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            onClick={handleNewTab}
            title="New tab"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => { closeTab(contextMenu.tabId); setContextMenu(null); }}
          >
            Close
          </button>
          <button
            className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => { closeOtherTabs(contextMenu.tabId); setContextMenu(null); }}
          >
            Close Others
          </button>
          <button
            className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => { closeAllTabs(); setContextMenu(null); }}
          >
            Close All
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={handleCopyPath}
          >
            Copy Path
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            disabled={tabs.findIndex((t) => t.id === contextMenu.tabId) === 0}
            onClick={handleMoveLeft}
          >
            Move Left
          </button>
          <button
            className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            disabled={tabs.findIndex((t) => t.id === contextMenu.tabId) === tabs.length - 1}
            onClick={handleMoveRight}
          >
            Move Right
          </button>
        </div>
      )}
    </>
  );
}
