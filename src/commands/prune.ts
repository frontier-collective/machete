import { loadConfig } from "../lib/config.js";
import {
  isGitRepo,
  fetchPrune,
  getLocalBranches,
  getRemoteBranches,
  getCurrentBranch,
  deleteBranch,
} from "../lib/git.js";
import type { ParsedArgs } from "../cli/args.js";
import type { PruneOptions, PruneResult } from "../lib/types.js";
import {
  success,
  warning,
  error,
  info,
  dim,
  bold,
  branchList,
  protectedBranchList,
} from "../cli/format.js";
import { confirm, selectMultiple } from "../cli/prompt.js";

export async function runPrune(args: ParsedArgs): Promise<void> {
  if (!isGitRepo()) {
    error("Not a git repository.");
    process.exit(1);
  }

  const config = loadConfig();

  const options: PruneOptions = {
    dryRun: args.dryRun === true,
    force: args.force === true,
    remote:
      typeof args.remote === "string" ? args.remote : config.defaultRemote,
    interactive: args.interactive === true || args.i === true,
  };

  info(`Fetching from ${bold(options.remote)}...`);
  fetchPrune(options.remote);

  const currentBranch = getCurrentBranch();
  const localBranches = getLocalBranches();
  const remoteBranches = getRemoteBranches(options.remote);

  const staleBranches: string[] = [];
  const skippedProtected: string[] = [];

  for (const branch of localBranches) {
    if (branch === currentBranch) continue;

    if (!remoteBranches.includes(branch)) {
      if (config.protectedBranches.includes(branch)) {
        skippedProtected.push(branch);
      } else {
        staleBranches.push(branch);
      }
    }
  }

  if (skippedProtected.length > 0) {
    console.log(`\n${bold("Protected branches skipped:")}`);
    protectedBranchList(skippedProtected, "  ");
  }

  if (staleBranches.length === 0) {
    console.log();
    success("No stale branches found. Repository is clean.");
    return;
  }

  console.log(`\n${bold("Branches with no remote equivalent:")}`);
  branchList(staleBranches, "  ");
  console.log();

  if (options.dryRun) {
    info(
      `${bold(String(staleBranches.length))} branch(es) would be deleted. ${dim("(dry run)")}`
    );
    return;
  }

  let toDelete = staleBranches;

  if (options.interactive) {
    toDelete = await selectMultiple(
      "Select branches to delete:",
      staleBranches
    );
    if (toDelete.length === 0) {
      info("No branches selected.");
      return;
    }
  } else if (!options.force) {
    const confirmed = await confirm(
      `Delete ${bold(String(toDelete.length))} branch(es)?`
    );
    if (!confirmed) {
      info("Aborted.");
      return;
    }
  }

  const result: PruneResult = {
    deleted: [],
    skippedProtected,
    total: toDelete.length,
    dryRun: false,
  };

  for (const branch of toDelete) {
    try {
      deleteBranch(branch);
      result.deleted.push(branch);
      success(`Deleted ${bold(branch)}`);
    } catch (e) {
      error(`Failed to delete ${bold(branch)}: ${(e as Error).message}`);
    }
  }

  console.log();
  success(
    `Deleted ${bold(String(result.deleted.length))}/${result.total} branch(es).`
  );
}
