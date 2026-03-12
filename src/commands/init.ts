import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isGitRepo, getRepoRoot, getRemotes } from "../lib/git.js";
import { success, warning, error, info, dim, bold } from "../cli/format.js";
import { selectOne } from "../cli/prompt.js";
import { ensureGitignored } from "../lib/gitignore.js";
import type { MacheteConfig } from "../lib/types.js";

function buildDefaultConfig(): MacheteConfig {
  return {
    protectedBranches: ["main", "master", "develop"],
    defaultRemote: "origin",
  };
}

async function resolveDefaultRemote(config: MacheteConfig): Promise<MacheteConfig> {
  const remotes = getRemotes();

  if (remotes.length === 0) {
    return config;
  }

  if (remotes.length === 1) {
    config.defaultRemote = remotes[0];
    info(`Detected remote: ${bold(remotes[0])}`);
    return config;
  }

  info(`Detected ${bold(String(remotes.length))} remotes.`);
  const selected = await selectOne("Which remote should be the default?", remotes);
  config.defaultRemote = selected;
  return config;
}

export async function runInit(): Promise<void> {
  if (!isGitRepo()) {
    error("Not a git repository.");
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const configPath = join(repoRoot, ".macheterc");

  if (existsSync(configPath)) {
    warning(`.macheterc already exists at ${bold(configPath)}`);
    return;
  }

  let config = buildDefaultConfig();
  config = await resolveDefaultRemote(config);

  // Only write non-credential keys to .macheterc
  const { anthropicApiKey, githubToken, bitbucketToken, ...configOnly } = config;
  const configJson = JSON.stringify(configOnly, null, 2);
  writeFileSync(configPath, configJson + "\n");
  success(`Created ${bold(".macheterc")} at ${dim(configPath)}`);

  console.log();
  warning(
    `${bold(".macheterc")} may contain project-specific settings you don't want in version control.`
  );
  info(
    `Secrets like API keys are stored separately in ${bold(".machete.env")} (created on first use via ${bold("machete config")}).`
  );
  console.log();

  await ensureGitignored(".macheterc");
}
