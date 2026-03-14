export interface MacheteConfig {
  protectedBranches: string[];
  defaultRemote: string;
  prBaseBranch?: string;
  anthropicApiKey?: string;
  githubToken?: string;
  bitbucketToken?: string;
}

export type ConfigKey = keyof MacheteConfig;

export const CREDENTIAL_KEYS: ReadonlySet<ConfigKey> = new Set([
  "anthropicApiKey",
  "githubToken",
  "bitbucketToken",
]);

export const ARRAY_KEYS: ReadonlySet<ConfigKey> = new Set([
  "protectedBranches",
]);

export const ALL_KEYS: ReadonlySet<ConfigKey> = new Set([
  "protectedBranches",
  "defaultRemote",
  "prBaseBranch",
  "anthropicApiKey",
  "githubToken",
  "bitbucketToken",
]);

export interface ConfigSource {
  key: ConfigKey;
  value: unknown;
  source: string;
}

export interface PruneOptions {
  dryRun: boolean;
  remote: string;
  interactive: boolean;
  noInteraction: boolean;
}

export interface PruneResult {
  deleted: string[];
  skippedProtected: string[];
  skippedUnsafe: string[];
  total: number;
  dryRun: boolean;
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

export interface BranchInfo {
  name: string;
  isProtected: boolean;
  hasRemote: boolean;
}

// ─── JSON output types (for GUI consumption) ────────────────────────

export interface RepoStatusJson {
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

export interface FileStatusJson {
  file: string;
  added: number;
  removed: number;
  binary: boolean;
}

export interface CommitContextJson {
  branch: string;
  staged: FileStatusJson[];
  unstaged: FileStatusJson[];
  recentCommits: string[];
}

export interface PruneClassificationJson {
  currentBranch: string;
  kept: { name: string; reason: string }[];
  protected: string[];
  safe: BranchSafetyResult[];
  unsafe: BranchSafetyResult[];
}

export interface PrContextJson {
  branch: string;
  baseBranch: string;
  commitCount: number;
  commits: string[];
  commitLog: string;
  filesChanged: FileStatusJson[];
  totalAdded: number;
  totalRemoved: number;
  onRemote: boolean;
  upToDate: boolean;
  aheadCount: number;
}

export interface ReleasePreviewJson {
  currentVersion: string;
  versions: {
    patch: string;
    minor: string;
    major: string;
  };
}

export interface ConfigEntryJson {
  key: string;
  value: unknown;
  source: string;
}
