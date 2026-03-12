import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getRepoRoot, isGitRepo } from "./git.js";
import type { MacheteConfig, ConfigKey, ConfigSource } from "./types.js";
import { CREDENTIAL_KEYS } from "./types.js";

const DEFAULT_CONFIG: MacheteConfig = {
  protectedBranches: ["main", "master", "develop"],
  defaultRemote: "origin",
};

// ─── Paths ───────────────────────────────────────────────────────────

export function globalConfigPath(): string {
  return join(homedir(), ".machete", "macheterc");
}

export function globalCredentialsPath(): string {
  return join(homedir(), ".machete", "credentials");
}

export function localConfigPath(): string | null {
  if (!isGitRepo()) return null;
  return join(getRepoRoot(), ".macheterc");
}

export function localCredentialsPath(): string | null {
  if (!isGitRepo()) return null;
  return join(getRepoRoot(), ".machete.env");
}

// ─── Read ────────────────────────────────────────────────────────────

function readJsonFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJsonFile(path: string, data: Record<string, unknown>): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export function loadConfig(): MacheteConfig {
  const globalConfig = readJsonFile(globalConfigPath());
  const globalCreds = readJsonFile(globalCredentialsPath());
  const localConfig = localConfigPath() ? readJsonFile(localConfigPath()!) : {};
  const localCreds = localCredentialsPath() ? readJsonFile(localCredentialsPath()!) : {};

  return {
    ...DEFAULT_CONFIG,
    ...globalConfig,
    ...globalCreds,
    ...localConfig,
    ...localCreds,
  } as MacheteConfig;
}

// ─── Source-annotated read ───────────────────────────────────────────

interface SourceLayer {
  label: string;
  data: Record<string, unknown>;
}

export function loadConfigWithSources(): ConfigSource[] {
  const layers: SourceLayer[] = [
    { label: "default", data: DEFAULT_CONFIG as unknown as Record<string, unknown> },
    { label: globalConfigPath(), data: readJsonFile(globalConfigPath()) },
    { label: globalCredentialsPath(), data: readJsonFile(globalCredentialsPath()) },
  ];

  const lcp = localConfigPath();
  if (lcp) {
    layers.push({ label: lcp, data: readJsonFile(lcp) });
  }

  const lcredp = localCredentialsPath();
  if (lcredp) {
    layers.push({ label: lcredp, data: readJsonFile(lcredp) });
  }

  const merged = new Map<ConfigKey, ConfigSource>();

  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer.data)) {
      merged.set(key as ConfigKey, {
        key: key as ConfigKey,
        value,
        source: layer.label,
      });
    }
  }

  return Array.from(merged.values());
}

// ─── Write ───────────────────────────────────────────────────────────

export function writeConfigValue(
  key: ConfigKey,
  value: unknown,
  global: boolean
): string {
  const isCredential = CREDENTIAL_KEYS.has(key);
  let path: string;

  if (global) {
    path = isCredential ? globalCredentialsPath() : globalConfigPath();
  } else {
    if (!isGitRepo()) {
      throw new Error("Not in a git repository. Use -g for global config.");
    }
    path = isCredential ? localCredentialsPath()! : localConfigPath()!;
  }

  const data = readJsonFile(path);
  data[key] = value;
  writeJsonFile(path, data);
  return path;
}

export function readConfigValue(key: ConfigKey): { value: unknown; source: string } | null {
  const sources = loadConfigWithSources();
  const entry = sources.find((s) => s.key === key);
  return entry ? { value: entry.value, source: entry.source } : null;
}

export function addToArray(key: ConfigKey, item: string, global: boolean): string {
  const isCredential = CREDENTIAL_KEYS.has(key);
  let path: string;

  if (global) {
    path = isCredential ? globalCredentialsPath() : globalConfigPath();
  } else {
    if (!isGitRepo()) {
      throw new Error("Not in a git repository. Use -g for global config.");
    }
    path = isCredential ? localCredentialsPath()! : localConfigPath()!;
  }

  const data = readJsonFile(path);
  const arr = Array.isArray(data[key]) ? (data[key] as string[]) : [];
  if (!arr.includes(item)) {
    arr.push(item);
  }
  data[key] = arr;
  writeJsonFile(path, data);
  return path;
}

export function removeFromArray(key: ConfigKey, item: string, global: boolean): string {
  const isCredential = CREDENTIAL_KEYS.has(key);
  let path: string;

  if (global) {
    path = isCredential ? globalCredentialsPath() : globalConfigPath();
  } else {
    if (!isGitRepo()) {
      throw new Error("Not in a git repository. Use -g for global config.");
    }
    path = isCredential ? localCredentialsPath()! : localConfigPath()!;
  }

  const data = readJsonFile(path);
  const arr = Array.isArray(data[key]) ? (data[key] as string[]) : [];
  data[key] = arr.filter((v) => v !== item);
  writeJsonFile(path, data);
  return path;
}
