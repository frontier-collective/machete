import { createContext, useContext } from "react";
import type { RepoStatus } from "@/types";
import type { RepoLayout } from "@/hooks/useRepoLayout";

export interface RepoContextValue {
  repoPath: string | null;
  setRepoPath: (path: string | null) => void;
  status: RepoStatus | null;
  statusLoading: boolean;
  statusError: string | null;
  refreshStatus: () => void;
  selectedBranch: string | null;
  setSelectedBranch: (branch: string | null) => void;
  /** null = uncommitted changes view, string = viewing a specific commit */
  selectedCommitHash: string | null;
  setSelectedCommitHash: (hash: string | null) => void;
  /** Per-repo layout state (panel sizes, sidebar sections, etc.) */
  layout: RepoLayout;
  updateLayout: (partial: Partial<RepoLayout>) => void;
}

export const RepoContext = createContext<RepoContextValue>({
  repoPath: null,
  setRepoPath: () => {},
  status: null,
  statusLoading: false,
  statusError: null,
  refreshStatus: () => {},
  selectedBranch: null,
  setSelectedBranch: () => {},
  selectedCommitHash: null,
  setSelectedCommitHash: () => {},
  layout: {} as RepoLayout,
  updateLayout: () => {},
});

export function useRepo() {
  return useContext(RepoContext);
}
