import { useState, useCallback, useRef, useEffect } from "react";

export interface RepoLayout {
  // App-level
  sidebarWidth: number;
  logPanelPct: number;

  // CommitDetailView
  detailLeftPanelPct: number;
  detailFilesPct: number;

  // StagingView
  stagingLeftPanelPct: number;
  stagingStagedPct: number;
  stagingBottomHeight: number;

  // Sidebar sections
  branchesOpen: boolean;
  remotesOpen: boolean;
  tagsOpen: boolean;
  stashesOpen: boolean;
  expandedRemotes: string[];
  expandedFolders: string[];

  // Diff
  contextLines: number;
}

const DEFAULTS: RepoLayout = {
  sidebarWidth: 220,
  logPanelPct: 35,
  detailLeftPanelPct: 33,
  detailFilesPct: 65,
  stagingLeftPanelPct: 33,
  stagingStagedPct: 50,
  stagingBottomHeight: 120,
  branchesOpen: true,
  remotesOpen: false,
  tagsOpen: false,
  stashesOpen: false,
  expandedRemotes: [],
  expandedFolders: [],
  contextLines: 3,
};

function storageKey(repoPath: string): string {
  return `machete:layout:${repoPath}`;
}

function loadLayout(repoPath: string): RepoLayout {
  try {
    const raw = localStorage.getItem(storageKey(repoPath));
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge with defaults so new fields get their defaults
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // Corrupt data — ignore
  }
  return { ...DEFAULTS };
}

function saveLayout(repoPath: string, layout: RepoLayout): void {
  try {
    localStorage.setItem(storageKey(repoPath), JSON.stringify(layout));
  } catch {
    // Storage full or unavailable — ignore
  }
}

export function useRepoLayout(repoPath: string | null): {
  layout: RepoLayout;
  updateLayout: (partial: Partial<RepoLayout>) => void;
} {
  const [layout, setLayout] = useState<RepoLayout>(() =>
    repoPath ? loadLayout(repoPath) : { ...DEFAULTS }
  );

  // Track current repo path to avoid stale writes
  const repoPathRef = useRef(repoPath);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reload layout when repo changes
  useEffect(() => {
    repoPathRef.current = repoPath;
    if (repoPath) {
      setLayout(loadLayout(repoPath));
    } else {
      setLayout({ ...DEFAULTS });
    }
  }, [repoPath]);

  const updateLayout = useCallback(
    (partial: Partial<RepoLayout>) => {
      setLayout((prev) => {
        const next = { ...prev, ...partial };
        // Debounced save to localStorage (300ms to avoid thrashing during drag)
        if (repoPathRef.current) {
          const path = repoPathRef.current;
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => saveLayout(path, next), 300);
        }
        return next;
      });
    },
    []
  );

  return { layout, updateLayout };
}
