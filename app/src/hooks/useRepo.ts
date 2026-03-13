import { createContext, useContext } from "react";
import type { RepoStatus } from "@/types";

export interface RepoContextValue {
  repoPath: string | null;
  setRepoPath: (path: string | null) => void;
  status: RepoStatus | null;
  statusLoading: boolean;
  statusError: string | null;
  refreshStatus: () => void;
}

export const RepoContext = createContext<RepoContextValue>({
  repoPath: null,
  setRepoPath: () => {},
  status: null,
  statusLoading: false,
  statusError: null,
  refreshStatus: () => {},
});

export function useRepo() {
  return useContext(RepoContext);
}
