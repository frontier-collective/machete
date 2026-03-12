import type { ParsedArgs } from "../cli/args.js";
import type { ConfigKey } from "../lib/types.js";
import { ALL_KEYS, ARRAY_KEYS, CREDENTIAL_KEYS } from "../lib/types.js";
import {
  loadConfigWithSources,
  readConfigValue,
  writeConfigValue,
  addToArray,
  removeFromArray,
  localCredentialsPath,
} from "../lib/config.js";
import { existsSync } from "node:fs";
import { success, error, info, dim, bold } from "../cli/format.js";
import { ensureGitignored } from "../lib/gitignore.js";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM_CODE = "\x1b[2m";
const RESET = "\x1b[0m";

function maskCredential(value: string): string {
  if (value.length <= 8) return "****";
  return value.slice(0, 8) + "****";
}

function formatValue(key: ConfigKey, value: unknown): string {
  if (CREDENTIAL_KEYS.has(key) && typeof value === "string") {
    return maskCredential(value);
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

function printConfigHelp(): void {
  console.log(`
${bold("USAGE")}
  ${GREEN}machete config${RESET} ${YELLOW}<key>${RESET}                    Read a config value
  ${GREEN}machete config${RESET} ${YELLOW}<key> <value>${RESET}            Set a config value
  ${GREEN}machete config${RESET} ${YELLOW}<key>${RESET} --add ${YELLOW}<value>${RESET}     Add to an array
  ${GREEN}machete config${RESET} ${YELLOW}<key>${RESET} --remove ${YELLOW}<value>${RESET}  Remove from an array
  ${GREEN}machete config${RESET} --list                  Show all config with sources

${bold("FLAGS")}
  ${GREEN}-g${RESET}              Write to global config (~/.machete/)

${bold("KEYS")}
  ${CYAN}protectedBranches${RESET}   ${DIM_CODE}string[]${RESET}   Branches that are never deleted
  ${CYAN}defaultRemote${RESET}       ${DIM_CODE}string${RESET}     Remote to compare against
  ${CYAN}anthropicApiKey${RESET}     ${DIM_CODE}string${RESET}     Anthropic API key ${DIM_CODE}(credential)${RESET}
  ${CYAN}githubToken${RESET}         ${DIM_CODE}string${RESET}     GitHub personal access token ${DIM_CODE}(credential)${RESET}
  ${CYAN}bitbucketToken${RESET}      ${DIM_CODE}string${RESET}     Bitbucket app password ${DIM_CODE}(credential)${RESET}
`);
}

export async function runConfig(args: ParsedArgs): Promise<void> {
  // -g may consume the next positional arg as its value.
  // If args.g is a string, it's actually the key — shift it back.
  let global = false;
  if (args.g === true) {
    global = true;
  } else if (typeof args.g === "string") {
    global = true;
    args._.splice(1, 0, args.g as string);
  }

  // machete config --list
  if (args.list === true) {
    const sources = loadConfigWithSources();
    if (sources.length === 0) {
      info("No configuration found.");
      return;
    }
    console.log();
    for (const entry of sources) {
      const val = formatValue(entry.key, entry.value);
      const src = dim(`(${entry.source})`);
      console.log(`  ${CYAN}${entry.key}${RESET} = ${val}  ${src}`);
    }
    console.log();
    return;
  }

  const key = args._[1] as ConfigKey | undefined;

  // machete config (no key)
  if (!key) {
    printConfigHelp();
    return;
  }

  // Validate key
  if (!ALL_KEYS.has(key)) {
    error(`Unknown config key: ${bold(key)}`);
    info(`Valid keys: ${Array.from(ALL_KEYS).join(", ")}`);
    return;
  }

  const addValue = args.add;
  const removeValue = args.remove;

  // --add and --remove are mutually exclusive
  if (addValue !== undefined && removeValue !== undefined) {
    error("--add and --remove are mutually exclusive.");
    return;
  }

  // Array operations
  if (addValue !== undefined || removeValue !== undefined) {
    if (!ARRAY_KEYS.has(key)) {
      error(`${bold(key)} is not an array. Use ${bold("machete config " + key + " <value>")} instead.`);
      return;
    }

    if (addValue !== undefined) {
      const path = addToArray(key, String(addValue), global);
      await maybePromptGitignore(key, path);
      success(`Added ${bold(String(addValue))} to ${bold(key)} in ${dim(path)}`);
    } else {
      const path = removeFromArray(key, String(removeValue), global);
      success(`Removed ${bold(String(removeValue))} from ${bold(key)} in ${dim(path)}`);
    }
    return;
  }

  const value = args._[2];

  // Read mode: machete config <key>
  if (value === undefined) {
    const result = readConfigValue(key);
    if (result === null) {
      info(`${bold(key)} is not set.`);
    } else {
      const val = formatValue(key, result.value);
      console.log(`${val}  ${dim(`(${result.source})`)}`);
    }
    return;
  }

  // Write mode: machete config <key> <value>
  if (ARRAY_KEYS.has(key)) {
    error(`${bold(key)} is an array. Use ${bold("--add")} / ${bold("--remove")} to modify it.`);
    return;
  }

  const path = writeConfigValue(key, value, global);
  await maybePromptGitignore(key, path);
  success(`Set ${bold(key)} = ${formatValue(key, value)} in ${dim(path)}`);
}

async function maybePromptGitignore(key: ConfigKey, writtenPath: string): Promise<void> {
  if (!CREDENTIAL_KEYS.has(key)) return;

  const lcPath = localCredentialsPath();
  if (!lcPath || writtenPath !== lcPath) return;

  if (!existsSync(lcPath)) return;

  await ensureGitignored(".machete.env");
}
