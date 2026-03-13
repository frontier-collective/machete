import type { ParsedArgs } from "../cli/args.js";
import type { RepoStatusJson } from "../lib/types.js";
import { execSync } from "node:child_process";
import {
  isGitRepo,
  getCurrentBranch,
  isClean,
  getStagedFiles,
  getUnstagedFiles,
} from "../lib/git.js";
import { loadConfig } from "../lib/config.js";
import { error, bold } from "../cli/format.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

export async function runStatus(args: ParsedArgs): Promise<void> {
  if (!isGitRepo()) {
    if (args.json === true) {
      console.log(JSON.stringify({ error: "Not a git repository" }));
    } else {
      error("Not a git repository.");
    }
    process.exit(1);
  }

  const config = loadConfig();
  const branch = getCurrentBranch();
  const clean = isClean();
  const staged = getStagedFiles();
  const unstaged = getUnstagedFiles();
  const remote = config.defaultRemote || "origin";

  // Get ahead/behind counts
  let ahead = 0;
  let behind = 0;
  try {
    const output = execSync(`git rev-list --left-right --count ${remote}/${branch}...${branch}`, {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    const parts = output.split(/\s+/);
    behind = parseInt(parts[0], 10) || 0;
    ahead = parseInt(parts[1], 10) || 0;
  } catch {
    // Branch may not have a remote tracking branch
  }

  if (args.json === true) {
    const result: RepoStatusJson = {
      branch,
      isClean: clean,
      stagedFiles: staged,
      unstagedFiles: unstaged,
      stagedCount: staged.length,
      unstagedCount: unstaged.length,
      remote,
      aheadCount: ahead,
      behindCount: behind,
    };
    console.log(JSON.stringify(result));
    return;
  }

  // Interactive display
  console.log();
  console.log(`  ${bold("Branch:")} ${CYAN}${branch}${RESET}`);
  console.log(`  ${bold("Remote:")} ${remote}`);

  if (ahead > 0 || behind > 0) {
    const parts: string[] = [];
    if (ahead > 0) parts.push(`${GREEN}↑${ahead}${RESET}`);
    if (behind > 0) parts.push(`${RED}↓${behind}${RESET}`);
    console.log(`  ${bold("Status:")} ${parts.join(" ")}`);
  }

  if (clean) {
    console.log(`  ${bold("Working tree:")} ${GREEN}clean${RESET}`);
  } else {
    console.log(`  ${bold("Working tree:")} ${RED}dirty${RESET}`);
    if (staged.length > 0) {
      console.log(`  ${bold("Staged:")} ${staged.length} file${staged.length === 1 ? "" : "s"}`);
    }
    if (unstaged.length > 0) {
      console.log(`  ${bold("Unstaged:")} ${unstaged.length} file${unstaged.length === 1 ? "" : "s"}`);
    }
  }
  console.log();
}
