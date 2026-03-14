import { loadConfig } from "../lib/config.js";
import {
  isGitRepo,
  fetchPrune,
  getLocalBranches,
  getRemoteBranches,
  getCurrentBranch,
  deleteBranchSafe,
  classifyBranchSafety,
} from "../lib/git.js";
import type { ParsedArgs } from "../cli/args.js";
import type { PruneOptions, PruneResult, BranchSafetyResult, PruneClassificationJson } from "../lib/types.js";
import {
  success,
  warning,
  error,
  info,
  dim,
  bold,
  keptBranchList,
  deletableBranchList,
  unsafeBranchList,
  protectedBranchList,
} from "../cli/format.js";
import { confirm, selectMultiple } from "../cli/prompt.js";

function formatSafetyDetail(result: BranchSafetyResult): string {
  const parts: string[] = [];
  if (result.mergedInto.length > 0) {
    parts.push(`merged → ${result.mergedInto.join(", ")}`);
  }
  if (result.squashMergedInto.length > 0) {
    parts.push(`squash-merged → ${result.squashMergedInto.join(", ")}`);
  }
  if (result.onRemote && result.mergedInto.length === 0 && result.squashMergedInto.length === 0) {
    parts.push("on remote");
  }
  return parts.join(", ") || "fully merged";
}

function formatUnsafeDetail(result: BranchSafetyResult): string {
  const parts: string[] = [];
  if (result.unpushedCommitCount > 0) {
    const s = result.unpushedCommitCount === 1 ? "" : "s";
    parts.push(`${result.unpushedCommitCount} commit${s} not on remote`);
  }
  if (result.localOnlyCommitCount > 0) {
    const s = result.localOnlyCommitCount === 1 ? "" : "s";
    parts.push(`${result.localOnlyCommitCount} commit${s} not on any other branch`);
  }
  return parts.join(", ") || "unmerged work";
}

export async function runPrune(args: ParsedArgs): Promise<void> {
  if (!isGitRepo()) {
    error("Not a git repository.");
    process.exit(1);
  }

  const config = loadConfig();

  const options: PruneOptions = {
    dryRun: args.dryRun === true,
    remote:
      typeof args.remote === "string" ? args.remote : config.defaultRemote,
    interactive: args.interactive === true || args.i === true,
    noInteraction: args.n === true || args.noInteraction === true,
  };

  const jsonMode = args.json === true;
  if (!jsonMode) info(`Fetching from ${bold(options.remote)}...`);
  fetchPrune(options.remote);

  const currentBranch = getCurrentBranch();
  const localBranches = getLocalBranches();
  const remoteBranches = getRemoteBranches(options.remote);

  // Categorize all local branches
  const kept: { name: string; reason: string }[] = [];
  const protectedSkipped: string[] = [];
  const staleBranches: string[] = [];

  for (const branch of localBranches) {
    if (config.protectedBranches.includes(branch)) {
      // Protected branches are always listed as protected, even if current
      protectedSkipped.push(branch);
    } else if (branch === currentBranch) {
      kept.push({ name: branch, reason: "current" });
    } else if (remoteBranches.includes(branch)) {
      kept.push({ name: branch, reason: "on remote" });
    } else {
      staleBranches.push(branch);
    }
  }

  // Classify stale branches for safety
  const safetyResults = staleBranches.map((branch) =>
    classifyBranchSafety(branch, staleBranches, options.remote, config.protectedBranches)
  );
  const safeBranches = safetyResults.filter((r) => r.safe);
  const unsafeBranches = safetyResults.filter((r) => !r.safe);

  // JSON mode: return classification data
  if (args.json === true) {
    const result: PruneClassificationJson = {
      currentBranch,
      kept,
      protected: protectedSkipped,
      safe: safeBranches,
      unsafe: unsafeBranches,
    };
    console.log(JSON.stringify(result));
    return;
  }

  // Display full summary
  if (kept.length > 0) {
    console.log(`\n${bold("Local branches:")}`);
    keptBranchList(kept, "  ");
  }

  if (protectedSkipped.length > 0) {
    console.log(`\n${bold("Protected:")}`);
    protectedBranchList(protectedSkipped, "  ");
  }

  if (safeBranches.length > 0) {
    console.log(`\n${bold("Will delete:")}`);
    deletableBranchList(
      safeBranches.map((r) => ({
        name: r.branch,
        detail: formatSafetyDetail(r),
      })),
      "  "
    );
  }

  if (unsafeBranches.length > 0) {
    console.log(`\n${bold("Keeping (unmerged work):")}`);
    unsafeBranchList(
      unsafeBranches.map((r) => ({
        name: r.branch,
        detail: formatUnsafeDetail(r),
      })),
      "  "
    );
  }

  console.log();

  if (safeBranches.length === 0) {
    if (unsafeBranches.length > 0) {
      info(
        `No branches safe to delete. ${bold(String(unsafeBranches.length))} branch(es) have unmerged work.`
      );
    } else {
      success("No stale branches found. Repository is clean.");
    }
    return;
  }

  if (options.dryRun) {
    info(
      `${bold(String(safeBranches.length))} branch(es) would be deleted. ${dim("(dry run)")}`
    );
    return;
  }

  let toDelete = safeBranches.map((r) => r.branch);

  if (options.interactive) {
    toDelete = await selectMultiple(
      "Select branches to delete:",
      toDelete
    );
    if (toDelete.length === 0) {
      info("No branches selected.");
      return;
    }
  } else if (!options.noInteraction) {
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
    skippedProtected: protectedSkipped,
    skippedUnsafe: unsafeBranches.map((r) => r.branch),
    total: toDelete.length,
    dryRun: false,
  };

  for (const branch of toDelete) {
    try {
      deleteBranchSafe(branch);
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
