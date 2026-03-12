import { execSync } from "node:child_process";

export function exec(command: string): string {
  return execSync(command, { encoding: "utf-8" }).trim();
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

export function getRemotes(): string[] {
  try {
    const output = exec("git remote");
    if (!output) return [];
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
