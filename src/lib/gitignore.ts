import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { getRepoRoot, isGitRepo, exec } from "./git.js";
import { success, info, bold } from "../cli/format.js";
import { confirm } from "../cli/prompt.js";

function isInGitignore(entry: string, gitignorePath: string): boolean {
  if (!existsSync(gitignorePath)) return false;
  const content = readFileSync(gitignorePath, "utf-8");
  return content.split("\n").some((line) => line.trim() === entry);
}

function hasBeenCommitted(file: string): boolean {
  try {
    const output = exec(`git log --oneline -- ${file}`);
    return output.length > 0;
  } catch {
    return false;
  }
}

function addToGitignore(entry: string, gitignorePath: string): void {
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    const separator = content.endsWith("\n") ? "" : "\n";
    appendFileSync(gitignorePath, `${separator}${entry}\n`);
  } else {
    writeFileSync(gitignorePath, `${entry}\n`);
  }
}

export async function ensureGitignored(entry: string): Promise<void> {
  if (!isGitRepo()) return;

  const repoRoot = getRepoRoot();
  const gitignorePath = join(repoRoot, ".gitignore");

  if (isInGitignore(entry, gitignorePath)) return;
  if (hasBeenCommitted(entry)) return;

  const shouldAdd = await confirm(
    `Add ${bold(entry)} to .gitignore now?`
  );

  if (shouldAdd) {
    addToGitignore(entry, gitignorePath);
    success(`Added ${bold(entry)} to .gitignore.`);
  } else {
    info(`Remember to add ${bold(entry)} to your .gitignore manually.`);
  }
}
