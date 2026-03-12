export interface MacheteConfig {
  protectedBranches: string[];
  defaultRemote: string;
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
  force: boolean;
  remote: string;
  interactive: boolean;
}

export interface PruneResult {
  deleted: string[];
  skippedProtected: string[];
  total: number;
  dryRun: boolean;
}

export interface BranchInfo {
  name: string;
  isProtected: boolean;
  hasRemote: boolean;
}
