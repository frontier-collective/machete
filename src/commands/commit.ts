import type { ParsedArgs } from "../cli/args.js";
import {
  isGitRepo,
  getCurrentBranch,
  getStagedFiles,
  getUnstagedFiles,
  stageAll,
  getStagedDiff,
  getRecentCommitMessages,
  commitWithMessage,
  pushWithTags,
} from "../lib/git.js";
import { loadConfig } from "../lib/config.js";
import { success, error, warning, info, dim, bold } from "../cli/format.js";
import { confirm } from "../cli/prompt.js";

const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function cleanCommitMessage(raw: string): string {
  return raw
    .replace(/^```[\w]*\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim();
}

function buildPrompt(branch: string, recentCommits: string, diff: string): string {
  return `You are generating a git commit message for staged changes.

Branch: ${branch || "detached HEAD"}

${recentCommits ? `Recent commits for style reference:\n${recentCommits}\n` : ""}
Staged diff:

${diff}

Write a commit message following the Conventional Commits format:

<type>(<optional scope>): <short summary>

<optional body — wrap at 72 chars>

Rules:
- The type must be one of: feat, fix, refactor, docs, test, chore, style, perf, build, ci
- The summary line must be lowercase, imperative mood, no period at the end, under 72 characters
- If the change is simple, omit the body entirely
- If the change is complex, add a body separated by a blank line explaining WHY the change was made, not WHAT (the diff shows what)
- Do not include markdown formatting, code fences, or any decoration — output ONLY the raw commit message text
- Match the tone and style of the recent commit messages shown above
- Be concise — developers read these quickly`;
}

async function generateCommitMessage(apiKey: string, prompt: string): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response format from Anthropic API.");
  }

  return cleanCommitMessage(block.text);
}

export async function runCommit(args: ParsedArgs): Promise<void> {
  if (!isGitRepo()) {
    error("Not a git repository.");
    process.exit(1);
  }

  const config = loadConfig();

  if (!config.anthropicApiKey) {
    warning("No Anthropic API key configured.");
    info(`Run ${bold("machete config anthropicApiKey <key>")} to set one.`);
    process.exit(1);
  }

  const dryRun = args.dryRun === true;

  let staged = getStagedFiles();
  const unstaged = getUnstagedFiles();

  if (staged.length === 0 && unstaged.length === 0) {
    info("Nothing to commit.");
    return;
  }

  if (unstaged.length > 0) {
    console.log();
    console.log(`${bold("Unstaged changes:")}`);
    for (const file of unstaged) {
      console.log(`  ${CYAN}${file}${RESET}`);
    }
    console.log();

    const prompt = staged.length === 0
      ? "No files are staged. Stage all changes?"
      : "There are also unstaged changes. Stage them too?";

    const shouldStage = await confirm(prompt);
    if (shouldStage) {
      stageAll();
      staged = getStagedFiles();
    }
  }

  if (staged.length === 0) {
    info("No staged files. Nothing to commit.");
    return;
  }

  const diff = getStagedDiff();
  if (!diff) {
    error("Staged diff is empty.");
    return;
  }

  const branch = getCurrentBranch();
  const recentCommits = getRecentCommitMessages(5);
  const prompt = buildPrompt(branch, recentCommits, diff);

  info("Generating commit message...");

  let message: string;
  try {
    message = await generateCommitMessage(config.anthropicApiKey, prompt);
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    if (typeof e.status === "number") {
      warning(`Anthropic API error (${e.status}): ${e.message || "Unknown error"}`);
    } else if (e.code === "ENOTFOUND" || e.code === "ECONNREFUSED") {
      warning("Network error — check your internet connection.");
    } else {
      warning(`Failed to generate commit message: ${e.message || String(err)}`);
    }
    process.exit(1);
  }

  console.log();
  console.log(bold("Commit message:"));
  console.log();
  console.log(message);
  console.log();

  if (dryRun) {
    console.log(bold("Staged files:"));
    for (const file of staged) {
      console.log(`  ${CYAN}${file}${RESET}`);
    }
    console.log();
    info(`Dry run complete — nothing was committed. ${dim("(remove --dry-run to commit)")}`);
    return;
  }

  try {
    commitWithMessage(message);
    success("Committed successfully.");
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    warning(`Commit failed: ${e.message || String(err)}`);
    process.exit(1);
  }

  const shouldPush = await confirm(`Push to origin/${branch}?`, true);
  if (shouldPush) {
    pushWithTags("origin", [branch]);
    success("Pushed to origin.");
  }
}
