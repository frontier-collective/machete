export interface RepoStatus {
  branch: string;
  isClean: boolean;
  stagedFiles: string[];
  unstagedFiles: string[];
  stagedCount: number;
  unstagedCount: number;
  remote: string;
  aheadCount: number;
  behindCount: number;
  /** Short commit hash when HEAD is detached, null otherwise */
  detachedAt: string | null;
}

export interface FileStatus {
  file: string;
  added: number;
  removed: number;
  binary: boolean;
  /** Git status letter: A (added), M (modified), D (deleted), R (renamed), C (copied) */
  status?: string;
  /** File size in bytes (only present for binary files) */
  size?: number;
}

export interface CommitContext {
  branch: string;
  staged: FileStatus[];
  unstaged: FileStatus[];
  recentCommits: string[];
}

export interface BranchSafetyResult {
  branch: string;
  safe: boolean;
  onRemote: boolean;
  unpushedCommitCount: number;
  localOnlyCommitCount: number;
  mergedInto: string[];
  squashMergedInto: string[];
}

export interface PruneClassification {
  currentBranch: string;
  kept: { name: string; reason: string }[];
  protected: string[];
  safe: BranchSafetyResult[];
  unsafe: BranchSafetyResult[];
}

export interface PrContext {
  branch: string;
  baseBranch: string;
  commitCount: number;
  commits: string[];
  commitLog: string;
  filesChanged: FileStatus[];
  totalAdded: number;
  totalRemoved: number;
  onRemote: boolean;
  upToDate: boolean;
  aheadCount: number;
}

export interface GithubPr {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  headRefName: string;
  baseRefName: string;
  author: { login: string };
  url: string;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviewDecision: string;
  labels: { name: string; color: string }[];
  comments: { totalCount?: number }[];
  mergedAt?: string;
  closedAt?: string;
}

export interface ReleasePreview {
  currentVersion: string;
  versions: {
    patch: string;
    minor: string;
    major: string;
  };
}

export interface ConfigEntry {
  key: string;
  value: unknown;
  source: string;
}

export type View = "dashboard" | "commit" | "branches" | "pr" | "release" | "settings";

// Merge / Rebase
export interface ConflictFile {
  file: string;
  status: string;
  resolved?: boolean;
}

export interface MergeResult {
  success: boolean;
  conflicts?: ConflictFile[];
  squash?: boolean;
  message: string;
  operation?: string;
}

export interface MergeState {
  inMerge: boolean;
  inRebase: boolean;
  conflicts: ConflictFile[];
}

// Sidebar data
export interface BranchInfo {
  name: string;
  current: boolean;
  ahead: number;
  behind: number;
  /** Whether this branch has a remote tracking branch */
  hasRemote: boolean;
}

export interface RemoteInfo {
  name: string;
  branches: string[];
}

// Commit detail (for viewing a historical commit)
export interface CommitDetail {
  hash: string;
  message: string;
  author: string;
  date: string;
  files: FileStatus[];
}

// Stash
export interface StashEntry {
  index: number;
  ref: string;
  message: string;
  date: string;
}

// Commit log
export interface CommitLogEntry {
  hash: string;
  shortHash: string;
  parents: string[];
  message: string;
  author: string;
  date: string;
  refs: string[];
}
