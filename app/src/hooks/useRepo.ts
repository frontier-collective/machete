import { createContext, useContext } from "react";
import type { RepoStatus, PruneClassification, GithubPr } from "@/types";
import type { RepoLayout } from "@/hooks/useRepoLayout";

// ─── Split contexts ─────────────────────────────────────────────────
// Each context slice only triggers re-renders in components that
// consume that specific slice, avoiding global cascade re-renders.

export interface RepoPathContextValue {
  repoPath: string | null;
  setRepoPath: (path: string | null) => void;
}

export interface StatusContextValue {
  status: RepoStatus | null;
  statusLoading: boolean;
  statusError: string | null;
  refreshStatus: () => void;
}

export interface SelectionContextValue {
  selectedBranch: string | null;
  setSelectedBranch: (branch: string | null) => void;
  selectedCommitHash: string | null;
  setSelectedCommitHash: (hash: string | null) => void;
}

export interface LayoutContextValue {
  layout: RepoLayout;
  updateLayout: (partial: Partial<RepoLayout>) => void;
}

export interface ClassificationContextValue {
  classification: PruneClassification | null;
  classificationLoading: boolean;
  fetchClassification: () => Promise<void>;
}

export interface RepoMetadataContextValue {
  defaultBranch: string | null;
  protectedBranches: string[];
}

export interface PullRequestsContextValue {
  /** Map from branch name → open PR (includes drafts). Only OPEN/DRAFT PRs. */
  prByBranch: Map<string, GithubPr>;
}

export const RepoPathContext = createContext<RepoPathContextValue>({
  repoPath: null,
  setRepoPath: () => {},
});

export const StatusContext = createContext<StatusContextValue>({
  status: null,
  statusLoading: false,
  statusError: null,
  refreshStatus: () => {},
});

export const SelectionContext = createContext<SelectionContextValue>({
  selectedBranch: null,
  setSelectedBranch: () => {},
  selectedCommitHash: null,
  setSelectedCommitHash: () => {},
});

export const LayoutContext = createContext<LayoutContextValue>({
  layout: {} as RepoLayout,
  updateLayout: () => {},
});

export const ClassificationContext = createContext<ClassificationContextValue>({
  classification: null,
  classificationLoading: false,
  fetchClassification: async () => {},
});

export const RepoMetadataContext = createContext<RepoMetadataContextValue>({
  defaultBranch: null,
  protectedBranches: ["main", "master", "develop"],
});

export const PullRequestsContext = createContext<PullRequestsContextValue>({
  prByBranch: new Map(),
});

// ─── Targeted hooks (prefer these) ─────────────────────────────────

export function useRepoPath() {
  return useContext(RepoPathContext);
}

export function useStatus() {
  return useContext(StatusContext);
}

export function useSelection() {
  return useContext(SelectionContext);
}

export function useLayout() {
  return useContext(LayoutContext);
}

export function useClassification() {
  return useContext(ClassificationContext);
}

export function useRepoMetadata() {
  return useContext(RepoMetadataContext);
}

export function usePullRequests() {
  return useContext(PullRequestsContext);
}

// ─── Legacy combined context ────────────────────────────────────────
// Kept for backward compat — prefer the targeted hooks above.
// Components using useRepo() will re-render on ANY slice change.

export type RepoContextValue =
  RepoPathContextValue &
  StatusContextValue &
  SelectionContextValue &
  LayoutContextValue;

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
