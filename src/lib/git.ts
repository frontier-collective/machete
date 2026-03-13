import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { BranchSafetyResult } from "./types.js";

export function exec(command: string): string {
  return execSync(command, { encoding: "utf-8" }).trim();
}

function execQuiet(command: string): string {
  return execSync(command, { encoding: "utf-8", stdio: "pipe" }).trim();
}

export function isGitRepo(): boolean {
  try {
    exec("git rev-parse --is-inside-work-tree");
    return true;
  } catch {
    return false;
  }
}

export function getRepoRoot(): string {
  return exec("git rev-parse --show-toplevel");
}

export function getCurrentBranch(): string {
  return exec("git branch --show-current");
}

export function fetchPrune(remote: string): void {
  execSync(`git fetch ${remote} --prune`, { stdio: "inherit" });
}

export function getLocalBranches(): string[] {
  const output = exec("git branch --format='%(refname:short)'");
  if (!output) return [];
  return output
    .split("\n")
    .map((b) => b.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
}

export function getRemoteBranches(remote: string): string[] {
  const output = exec(
    `git branch -r --format='%(refname:short)'`
  );
  if (!output) return [];
  const prefix = `${remote}/`;
  return output
    .split("\n")
    .map((b) => b.trim().replace(/^'|'$/g, ""))
    .filter((b) => b.startsWith(prefix))
    .map((b) => b.slice(prefix.length))
    .filter((b) => b !== "HEAD");
}

export function deleteBranch(branch: string): void {
  exec(`git branch -D ${branch}`);
}

export function deleteBranchSafe(branch: string): void {
  exec(`git branch -d ${branch}`);
}

export function getUnpushedCommits(branch: string): string[] {
  try {
    const output = exec(`git log ${branch} --not --remotes --format=%H`);
    if (!output) return [];
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function getCommitsNotOnOtherBranches(
  branch: string,
  excludeBranches: string[]
): string[] {
  try {
    const allLocal = getLocalBranches();
    const otherBranches = allLocal.filter(
      (b) => b !== branch && !excludeBranches.includes(b)
    );
    if (otherBranches.length === 0) {
      // No other branches to check against — all commits are "local only"
      const output = exec(`git log ${branch} --format=%H`);
      if (!output) return [];
      return output.split("\n").filter(Boolean);
    }
    const notRefs = otherBranches.map((b) => `refs/heads/${b}`).join(" ");
    const output = exec(`git log ${branch} --not ${notRefs} --format=%H`);
    if (!output) return [];
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function getBranchMergeTargets(branch: string): string[] {
  try {
    const output = exec(`git branch --contains ${branch} --format='%(refname:short)'`);
    if (!output) return [];
    return output
      .split("\n")
      .map((b) => b.trim().replace(/^'|'$/g, ""))
      .filter((b) => b && b !== branch);
  } catch {
    return [];
  }
}

function refExists(ref: string): boolean {
  try {
    execQuiet(`git rev-parse --verify ${ref}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse `git cherry <upstream> <branch>` output.
 * Returns commits marked `+` (no patch-equivalent in upstream)
 * and commits marked `-` (patch-equivalent exists in upstream).
 */
function parseCherryOutput(output: string): {
  unique: Set<string>;
  equivalent: Set<string>;
} {
  const unique = new Set<string>();
  const equivalent = new Set<string>();
  for (const line of output.split("\n").filter(Boolean)) {
    const hash = line.slice(2).trim();
    if (line.startsWith("+ ")) {
      unique.add(hash);
    } else if (line.startsWith("- ")) {
      equivalent.add(hash);
    }
  }
  return { unique, equivalent };
}

/**
 * Check if the combined diff of a branch has a patch-equivalent on a target branch.
 * This detects squash merges where multiple commits are combined into one.
 * Returns true if the combined patch-id of the branch matches any commit on the target.
 */
function isBranchSquashMergedInto(branch: string, target: string): boolean {
  try {
    const mergeBase = execQuiet(`git merge-base ${target} ${branch}`);
    if (!mergeBase) return false;

    // Get combined patch-id for the entire branch diff
    const branchPatchId = execSync(
      `git diff ${mergeBase}..${branch} | git patch-id --stable`,
      { encoding: "utf-8", stdio: "pipe" }
    ).trim().split(/\s+/)[0];
    if (!branchPatchId) return false;

    // Get patch-ids for all commits on target since the merge-base
    const targetPatchIds = execSync(
      `git log ${mergeBase}..${target} --format=%H | while read hash; do git diff "$hash"^.."$hash" 2>/dev/null | git patch-id --stable 2>/dev/null; done`,
      { encoding: "utf-8", stdio: "pipe", shell: "/bin/sh" }
    ).trim();
    if (!targetPatchIds) return false;

    const targetIds = new Set(
      targetPatchIds.split("\n").filter(Boolean).map((line) => line.split(/\s+/)[0])
    );
    return targetIds.has(branchPatchId);
  } catch {
    return false;
  }
}

export function classifyBranchSafety(
  branch: string,
  allStaleBranches: string[],
  remote: string,
  protectedBranches: string[]
): BranchSafetyResult {
  // Phase 1: fast hash-identity checks
  const hashUnpushed = getUnpushedCommits(branch);
  const hashLocalOnly = getCommitsNotOnOtherBranches(branch, allStaleBranches);
  const mergedInto = getBranchMergeTargets(branch);

  let unpushedCount = hashUnpushed.length;
  let localOnlyCount = hashLocalOnly.length;
  const squashMergedInto: string[] = [];

  // Phase 2: patch-equivalence check against remote protected branches
  // First tries git cherry (1:1 commit matching), then falls back to
  // combined diff comparison (detects multi-commit squash merges).
  if (hashUnpushed.length > 0) {
    const remoteRefs = protectedBranches
      .map((b) => `${remote}/${b}`)
      .filter((ref) => refExists(ref));

    // Try git cherry first (handles cherry-picks and single-commit squashes)
    const coveredByRemote = new Set<string>();
    for (const remoteRef of remoteRefs) {
      try {
        const output = execQuiet(`git cherry ${remoteRef} ${branch}`);
        if (!output) continue;
        const { equivalent } = parseCherryOutput(output);
        if (equivalent.size > 0) {
          const branchName = remoteRef.slice(remote.length + 1);
          squashMergedInto.push(branchName);
          for (const hash of equivalent) coveredByRemote.add(hash);
        }
      } catch {
        /* skip unreachable refs */
      }
    }
    unpushedCount = hashUnpushed.filter((h) => !coveredByRemote.has(h)).length;

    // Fallback: combined diff comparison (handles multi-commit squash merges)
    if (unpushedCount > 0) {
      for (const remoteRef of remoteRefs) {
        if (isBranchSquashMergedInto(branch, remoteRef)) {
          const branchName = remoteRef.slice(remote.length + 1);
          if (!squashMergedInto.includes(branchName)) {
            squashMergedInto.push(branchName);
          }
          unpushedCount = 0;
          break;
        }
      }
    }
  }

  // Phase 3: patch-equivalence check against local branches
  if (hashLocalOnly.length > 0) {
    const otherBranches = getLocalBranches().filter(
      (b) => b !== branch && !allStaleBranches.includes(b)
    );

    // Try git cherry first
    const coveredByLocal = new Set<string>();
    for (const localBranch of otherBranches) {
      try {
        const output = execQuiet(`git cherry ${localBranch} ${branch}`);
        if (!output) continue;
        const { equivalent } = parseCherryOutput(output);
        if (equivalent.size > 0) {
          if (
            !mergedInto.includes(localBranch) &&
            !squashMergedInto.includes(localBranch)
          ) {
            squashMergedInto.push(localBranch);
          }
          for (const hash of equivalent) coveredByLocal.add(hash);
        }
      } catch {
        /* skip */
      }
    }
    localOnlyCount = hashLocalOnly.filter(
      (h) => !coveredByLocal.has(h)
    ).length;

    // Fallback: combined diff comparison
    if (localOnlyCount > 0) {
      for (const localBranch of otherBranches) {
        if (isBranchSquashMergedInto(branch, localBranch)) {
          if (
            !mergedInto.includes(localBranch) &&
            !squashMergedInto.includes(localBranch)
          ) {
            squashMergedInto.push(localBranch);
          }
          localOnlyCount = 0;
          break;
        }
      }
    }
  }

  const onRemote = unpushedCount === 0;
  return {
    branch,
    safe: onRemote && localOnlyCount === 0,
    onRemote,
    unpushedCommitCount: unpushedCount,
    localOnlyCommitCount: localOnlyCount,
    mergedInto,
    squashMergedInto,
  };
}

export function getStagedFiles(): string[] {
  const output = exec("git diff --cached --name-only");
  if (!output) return [];
  return output.split("\n").filter(Boolean);
}

export function getUnstagedFiles(): string[] {
  const modified = exec("git diff --name-only");
  const untracked = exec("git ls-files --others --exclude-standard");
  const combined = `${modified}\n${untracked}`;
  return [...new Set(combined.split("\n").filter(Boolean))];
}

export interface FileDiffStat {
  file: string;
  added: number;
  removed: number;
  binary: boolean;
}

export function getStagedDiffStats(): FileDiffStat[] {
  return parseDiffNumstat(exec("git diff --cached --numstat"));
}

export function getUnstagedDiffStats(): FileDiffStat[] {
  return parseDiffNumstat(exec("git diff --numstat"));
}

function parseDiffNumstat(output: string): FileDiffStat[] {
  if (!output) return [];
  return output.split("\n").filter(Boolean).map((line) => {
    const [added, removed, ...fileParts] = line.split("\t");
    const file = fileParts.join("\t");
    if (added === "-") {
      return { file, added: 0, removed: 0, binary: true };
    }
    return { file, added: parseInt(added, 10), removed: parseInt(removed, 10), binary: false };
  });
}

export function stageAll(): void {
  exec("git add -A");
}

const MAX_DIFF_LENGTH = 100_000;

export function getStagedDiff(): string {
  const diff = exec("git diff --cached");
  if (diff.length > MAX_DIFF_LENGTH) {
    return diff.slice(0, MAX_DIFF_LENGTH) + "\n\n[diff truncated — exceeded 100k characters]";
  }
  return diff;
}

export function getRecentCommitMessages(count: number): string {
  try {
    return exec(`git log -${count} --pretty=format:"%s"`);
  } catch {
    return "";
  }
}

export function commitWithMessage(message: string): void {
  execSync("git commit -F -", { input: message, encoding: "utf-8" });
}

export function isClean(): boolean {
  const status = exec("git status --porcelain");
  return status.length === 0;
}

export function checkoutBranch(branch: string): void {
  exec(`git checkout ${branch}`);
}

export function createBranch(branch: string): void {
  exec(`git checkout -b ${branch}`);
}

function withTempFile(content: string, fn: (path: string) => void): void {
  const tmpPath = join(tmpdir(), `machete-msg-${Date.now()}.txt`);
  writeFileSync(tmpPath, content);
  try {
    fn(tmpPath);
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

export function mergeNoFf(branch: string, message: string): void {
  withTempFile(message, (msgFile) => {
    execSync(`git merge --no-ff "${branch}" -F "${msgFile}"`, { encoding: "utf-8" });
  });
}

export function createTag(tag: string, message: string): void {
  withTempFile(message, (msgFile) => {
    execSync(`git tag -a "${tag}" -F "${msgFile}"`, { encoding: "utf-8" });
  });
}

export function stageFiles(files: string[]): void {
  exec(`git add ${files.join(" ")}`);
}

export function getRootCommit(): string {
  try {
    return exec("git rev-list --max-parents=0 HEAD");
  } catch {
    return "";
  }
}

export function getLatestTag(): string {
  try {
    return exec("git tag --sort=-v:refname").split("\n")[0] || "";
  } catch {
    return "";
  }
}

export function getCommitLog(range: string): string {
  try {
    return exec(
      `git log ${range} --pretty=format:"- %s (%h)" --no-merges --invert-grep --grep="^release: v"`
    );
  } catch {
    return "";
  }
}

export function getCommitMessages(range: string): string {
  try {
    return exec(
      `git log ${range} --pretty=format:"%s" --no-merges --invert-grep --grep="^release: v"`
    );
  } catch {
    return "";
  }
}

export function getDiffStat(range: string): string {
  try {
    return exec(`git diff --stat ${range}`);
  } catch {
    return "";
  }
}

export function getFullDiff(range: string): string {
  try {
    const diff = execSync(`git diff ${range} -- "*.ts" "*.mjs"`, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 5,
    }).trim();
    if (diff.length > MAX_DIFF_LENGTH) {
      return diff.slice(0, MAX_DIFF_LENGTH) + "\n\n[diff truncated — exceeded 100k characters]";
    }
    return diff;
  } catch {
    return "";
  }
}

export function pushWithTags(remote: string, branches: string[]): void {
  execSync(`git push ${remote} ${branches.join(" ")} --tags`, { stdio: "inherit" });
}

export function isGhInstalled(): boolean {
  try {
    execSync("gh --version", { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function isGhAuthenticated(): boolean {
  try {
    execSync("gh auth status", { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function createGhRelease(tag: string, title: string, notes: string): void {
  execSync(`gh release create "${tag}" --title "${title}" --notes-file -`, {
    input: notes,
    encoding: "utf-8",
    stdio: ["pipe", "inherit", "inherit"],
  });
}

export function npmPublish(): void {
  execSync("npm publish --access public --auth-type=web", { stdio: "inherit" });
}

export function getRemotes(): string[] {
  try {
    const output = exec("git remote");
    if (!output) return [];
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
