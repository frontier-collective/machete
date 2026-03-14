import { useState, useCallback, useRef, useEffect } from "react";

export interface Tab {
  id: string;
  repoPath: string;
}

export interface TabManagerState {
  tabs: Tab[];
  activeTabId: string | null;
}

export interface TabManager {
  tabs: Tab[];
  activeTabId: string | null;
  activeTab: Tab | null;

  openTab: (repoPath: string) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: () => void;
  activateTab: (tabId: string) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
}

const STORAGE_KEY = "machete:session";
const RECENT_KEY = "machete:recent-repos";
const MAX_RECENT = 20;

let tabIdCounter = 0;
function nextTabId(): string {
  return `tab-${++tabIdCounter}-${Date.now()}`;
}

function loadSession(): TabManagerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TabManagerState;
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Corrupt — ignore
  }
  return { tabs: [], activeTabId: null };
}

function saveSession(state: TabManagerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full — ignore
  }
}

/** Add a repo path to the recent repos list. */
function addToRecent(repoPath: string): void {
  try {
    const recent = getRecentRepos();
    const filtered = recent.filter((p) => p !== repoPath);
    filtered.unshift(repoPath);
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
  } catch {
    // Ignore
  }
}

/** Get the list of recently opened repo paths. */
export function getRecentRepos(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore
  }
  return [];
}

/**
 * Migrate from single-repo localStorage key to tab session.
 * If there's a legacy `machete:repoPath` and no session, create a session with one tab.
 */
function migrateFromLegacy(): TabManagerState {
  const session = loadSession();
  if (session.tabs.length > 0) return session;

  const legacyPath = localStorage.getItem("machete:repoPath");
  if (legacyPath) {
    const tab: Tab = { id: nextTabId(), repoPath: legacyPath };
    const state: TabManagerState = { tabs: [tab], activeTabId: tab.id };
    saveSession(state);
    localStorage.removeItem("machete:repoPath");
    return state;
  }

  return { tabs: [], activeTabId: null };
}

export function useTabManager(): TabManager {
  const [state, setState] = useState<TabManagerState>(migrateFromLegacy);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist session on every change
  useEffect(() => {
    saveSession(state);
  }, [state]);

  const openTab = useCallback((repoPath: string) => {
    setState((prev) => {
      // If already open, switch to it
      const existing = prev.tabs.find((t) => t.repoPath === repoPath);
      if (existing) {
        return { ...prev, activeTabId: existing.id };
      }
      const tab: Tab = { id: nextTabId(), repoPath };
      addToRecent(repoPath);
      return {
        tabs: [...prev.tabs, tab],
        activeTabId: tab.id,
      };
    });
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setState((prev) => {
      const idx = prev.tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return prev;

      const next = prev.tabs.filter((t) => t.id !== tabId);
      let nextActive = prev.activeTabId;

      if (prev.activeTabId === tabId) {
        if (next.length === 0) {
          nextActive = null;
        } else if (idx < next.length) {
          nextActive = next[idx].id;
        } else {
          nextActive = next[next.length - 1].id;
        }
      }

      return { tabs: next, activeTabId: nextActive };
    });
  }, []);

  const closeOtherTabs = useCallback((tabId: string) => {
    setState((prev) => {
      const tab = prev.tabs.find((t) => t.id === tabId);
      if (!tab) return prev;
      return { tabs: [tab], activeTabId: tab.id };
    });
  }, []);

  const closeAllTabs = useCallback(() => {
    setState({ tabs: [], activeTabId: null });
  }, []);

  const activateTab = useCallback((tabId: string) => {
    setState((prev) => {
      if (prev.activeTabId === tabId) return prev;
      const exists = prev.tabs.some((t) => t.id === tabId);
      if (!exists) return prev;
      return { ...prev, activeTabId: tabId };
    });
  }, []);

  const moveTab = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      if (fromIndex === toIndex) return prev;
      if (fromIndex < 0 || fromIndex >= prev.tabs.length) return prev;
      if (toIndex < 0 || toIndex >= prev.tabs.length) return prev;

      const next = [...prev.tabs];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...prev, tabs: next };
    });
  }, []);

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    openTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    activateTab,
    moveTab,
  };
}
