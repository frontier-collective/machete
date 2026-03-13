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
}

export interface FileStatus {
  file: string;
  added: number;
  removed: number;
  binary: boolean;
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

// Sidebar data
export interface BranchInfo {
  name: string;
  current: boolean;
}

export interface RemoteInfo {
  name: string;
  branches: string[];
}

// Commit log
export interface CommitLogEntry {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  refs: string[];
}
