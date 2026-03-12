import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
