import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ParsedArgs } from "../cli/args.js";
import type { PrContextJson, FileStatusJson } from "../lib/types.js";
import {
  isGitRepo,
  getCurrentBranch,
  isClean,
  isGhInstalled,
  isGhAuthenticated,
  getCommitsSinceBase,
  getCommitMessagesSinceBase,
  getDiffStatSinceBase,
  getDiffFilesSinceBase,
  getRemoteDefaultBranch,
  branchExistsOnRemote,
  isBranchUpToDateWithRemote,
  getCommitCountAheadOfRemote,
  pushBranch,
  createPr,
} from "../lib/git.js";
import type { FileDiffStat } from "../lib/git.js";
import { loadConfig } from "../lib/config.js";
import { success, error, warning, info, dim, bold } from "../cli/format.js";
import { confirm, createRl } from "../cli/prompt.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ─── AI prompt ──────────────────────────────────────────────────────

function buildPrPrompt(
  branch: string,
  commitLog: string,
  diffStat: string,
  fileStats: FileDiffStat[]
): string {
  const fileList = fileStats
    .map((f) => {
      if (f.binary) return `  ${f.file} (binary)`;
      return `  ${f.file} (+${f.added} -${f.removed})`;
    })
    .join("\n");

  return `You are generating a GitHub pull request title and body.

Branch: ${branch}

Commits:
${commitLog}

Diff stats:
${diffStat}

Changed files:
${fileList}

Generate the PR title and body following this exact format:

TITLE: <concise title here>

BODY:
## Summary
<1-3 bullet points describing the changes>

## Changes
<per-file or per-area descriptions of what changed>

## Test plan
<checklist of items to verify>

Rules:
- Title: concise, imperative mood, under 70 characters, no ticket prefix
- Summary bullets: specific, no filler words
- Changes: describe what changed and why, grouped by file or logical area
- Test plan: practical checklist items (use markdown checkboxes - [ ])
- Tone: professional, specific, direct
- Do not include markdown code fences or any decoration around the output
- Output ONLY the TITLE: and BODY: sections as specified above`;
}

function parsePrResponse(raw: string): { title: string; body: string } {
  const cleaned = raw
    .replace(/^```[\w]*\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim();

  const titleMatch = cleaned.match(/^TITLE:\s*(.+)/m);
  const bodyMatch = cleaned.match(/^BODY:\s*\n([\s\S]+)/m);

  const title = titleMatch ? titleMatch[1].trim() : "";
  const body = bodyMatch ? bodyMatch[1].trim() : "";

  if (!title) {
    // Fallback: first line is title, rest is body
    const lines = cleaned.split("\n");
    return {
      title: lines[0].replace(/^#+\s*/, "").trim(),
      body: lines.slice(1).join("\n").trim(),
    };
  }

  return { title, body };
}

async function generatePr(
  apiKey: string,
  prompt: string
): Promise<{ title: string; body: string }> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response format from Anthropic API.");
  }

  return parsePrResponse(block.text);
}

// ─── Edit flow ──────────────────────────────────────────────────────

function openInEditor(title: string, body: string): { title: string; body: string } {
  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  const tmpPath = join(tmpdir(), `machete-pr-${Date.now()}.md`);
  const content = `${title}\n\n${body}`;
  writeFileSync(tmpPath, content);

  try {
    execSync(`${editor} "${tmpPath}"`, { stdio: "inherit" });
    const edited = readFileSync(tmpPath, "utf-8");
    const lines = edited.split("\n");
    const editedTitle = lines[0].trim();
    // Skip blank lines between title and body
    let bodyStart = 1;
    while (bodyStart < lines.length && lines[bodyStart].trim() === "") {
      bodyStart++;
    }
    const editedBody = lines.slice(bodyStart).join("\n").trim();
    return { title: editedTitle, body: editedBody };
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }
}

// ─── Main command ───────────────────────────────────────────────────

export async function runPr(args: ParsedArgs): Promise<void> {
  // ── Pre-flight checks ──

  if (!isGitRepo()) {
    error("Not a git repository.");
    process.exit(1);
  }

  if (!isGhInstalled()) {
    error("GitHub CLI (gh) is not installed.");
    info("Install it: https://cli.github.com/");
    process.exit(1);
  }

  if (!isGhAuthenticated()) {
    error("GitHub CLI is not authenticated.");
    info(`Run ${bold("gh auth login")} to authenticate.`);
    process.exit(1);
  }

  const config = loadConfig();
  const dryRun = args.dryRun === true;
  const draft = args.draft === true;
  const noai = args.noai === true;
  const explicitTitle = typeof args.title === "string" ? args.title : null;
  const explicitBody = typeof args.body === "string" ? args.body : null;

  if (!noai && !explicitTitle && !explicitBody && !config.anthropicApiKey) {
    warning("No Anthropic API key configured.");
    info(`Run ${bold("machete config anthropicApiKey <key>")} to set one, or use ${bold("--noai")}.`);
    process.exit(1);
  }

  const branch = getCurrentBranch();
  if (!branch) {
    error("Cannot create a PR from a detached HEAD.");
    process.exit(1);
  }

  const protectedBranches = config.protectedBranches || ["main", "master", "develop"];
  if (protectedBranches.includes(branch)) {
    error(`Cannot create PR from protected branch "${branch}".`);
    process.exit(1);
  }

  const jsonMode = args.json === true;

  if (!isClean()) {
    if (!jsonMode) warning("Working tree has uncommitted changes.");
  }

  // ── Base branch detection ──

  const explicitBase = typeof args.base === "string" ? args.base : null;
  let baseBranch: string;

  if (explicitBase) {
    baseBranch = explicitBase;
  } else if (config.prBaseBranch) {
    baseBranch = config.prBaseBranch;
    if (!jsonMode) info(`Base branch: ${bold(baseBranch)} ${dim("(from config)")}`);
  } else {
    const remote = config.defaultRemote || "origin";
    const detected = getRemoteDefaultBranch(remote);
    if (detected) {
      if (!jsonMode) info(`Base branch: ${bold(detected)} ${dim("(from remote default)")}`);
      if (jsonMode) {
        baseBranch = detected;
      } else {
        const useDetected = await confirm("Use this base?", true);
        if (!useDetected) {
          // Prompt for manual entry
          const rl = createRl();
          baseBranch = await new Promise<string>((resolve) => {
            rl.question("Base branch: ", (answer) => {
              rl.close();
              resolve(answer.trim());
            });
          });
          if (!baseBranch) {
            error("No base branch specified.");
            process.exit(1);
          }
        } else {
          baseBranch = detected;
        }
      }
    } else {
      if (!jsonMode) warning("Could not detect remote default branch.");
      if (jsonMode) {
        error("Could not detect base branch. Pass --base explicitly.");
        process.exit(1);
      }
      const rl = createRl();
      baseBranch = await new Promise<string>((resolve) => {
        rl.question("Base branch: ", (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
      if (!baseBranch) {
        error("No base branch specified.");
        process.exit(1);
      }
    }
  }

  // ── Gather context ──

  const remote = config.defaultRemote || "origin";
  const commits = getCommitsSinceBase(baseBranch);
  const commitLog = getCommitMessagesSinceBase(baseBranch);
  const diffStat = getDiffStatSinceBase(baseBranch);
  const fileStats = getDiffFilesSinceBase(baseBranch);

  if (commits.length === 0) {
    if (jsonMode) {
      console.log(JSON.stringify({ error: `No commits found between ${baseBranch} and ${branch}.` }));
      process.exit(1);
    }
    error(`No commits found between ${baseBranch} and ${branch}.`);
    process.exit(1);
  }

  const totalAdded = fileStats.reduce((sum, f) => sum + f.added, 0);
  const totalRemoved = fileStats.reduce((sum, f) => sum + f.removed, 0);

  // JSON mode
  if (jsonMode) {
    const onRemote = branchExistsOnRemote(branch, remote);
    const upToDate = onRemote ? isBranchUpToDateWithRemote(branch, remote) : false;
    const aheadCount = onRemote ? getCommitCountAheadOfRemote(branch, remote) : commits.length;

    if (args.generate === true) {
      // Generate AI title/body and return as JSON
      const prompt = buildPrPrompt(branch, commitLog, diffStat, fileStats);
      try {
        const generated = await generatePr(config.anthropicApiKey!, prompt);
        console.log(JSON.stringify(generated));
      } catch (err: unknown) {
        console.log(JSON.stringify({ error: String((err as Error).message || err) }));
        process.exit(1);
      }
      return;
    }

    const result: PrContextJson = {
      branch,
      baseBranch,
      commitCount: commits.length,
      commits,
      commitLog,
      filesChanged: fileStats.map((f): FileStatusJson => ({
        file: f.file, added: f.added, removed: f.removed, binary: f.binary,
      })),
      totalAdded,
      totalRemoved,
      onRemote,
      upToDate,
      aheadCount,
    };
    console.log(JSON.stringify(result));
    return;
  }

  info(
    `${commits.length} commit${commits.length === 1 ? "" : "s"}, ${fileStats.length} file${fileStats.length === 1 ? "" : "s"} changed ${dim(`(${GREEN}+${totalAdded}${RESET} ${RED}-${totalRemoved}${RESET})`)}`
  );

  // ── Push handling ──

  if (!dryRun) {
    const onRemote = branchExistsOnRemote(branch, remote);
    if (onRemote) {
      const upToDate = isBranchUpToDateWithRemote(branch, remote);
      if (!upToDate) {
        const aheadCount = getCommitCountAheadOfRemote(branch, remote);
        const shouldPush = await confirm(
          `Push ${aheadCount} new commit${aheadCount === 1 ? "" : "s"} to ${remote}?`,
          true
        );
        if (!shouldPush) {
          info("Aborted — branch must be pushed before creating a PR.");
          return;
        }
        pushBranch(branch, remote);
        success("Pushed.");
      }
    } else {
      const shouldPush = await confirm(
        `Branch not on remote. Push to ${remote}?`,
        true
      );
      if (!shouldPush) {
        info("Aborted — branch must be pushed before creating a PR.");
        return;
      }
      pushBranch(branch, remote);
      success("Pushed.");
    }
  }

  // ── Generate title and body ──

  let title: string;
  let body: string;

  if (noai || (explicitTitle && explicitBody)) {
    title = explicitTitle || "";
    body = explicitBody || "";

    if (!title || !body) {
      // Prompt for missing fields
      const rl = createRl();
      if (!title) {
        title = await new Promise<string>((resolve) => {
          rl.question("PR title: ", (answer) => resolve(answer.trim()));
        });
      }
      if (!body) {
        info("Enter PR body (end with an empty line):");
        const lines: string[] = [];
        body = await new Promise<string>((resolve) => {
          rl.on("line", (line) => {
            if (line === "") {
              rl.close();
              resolve(lines.join("\n"));
            } else {
              lines.push(line);
            }
          });
        });
      }
      rl.close();
    }
  } else {
    // AI generation
    info("Generating PR...");
    console.log();

    const needTitle = !explicitTitle;
    const needBody = !explicitBody;

    const prompt = buildPrPrompt(branch, commitLog, diffStat, fileStats);

    try {
      const generated = await generatePr(config.anthropicApiKey!, prompt);
      title = explicitTitle || generated.title;
      body = explicitBody || generated.body;
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      if (typeof e.status === "number") {
        warning(`Anthropic API error (${e.status}): ${e.message || "Unknown error"}`);
      } else if (e.code === "ENOTFOUND" || e.code === "ECONNREFUSED") {
        warning("Network error — check your internet connection.");
      } else {
        warning(`Failed to generate PR: ${e.message || String(err)}`);
      }
      process.exit(1);
    }
  }

  // ── Preview ──

  console.log(`  ${BOLD}Title:${RESET} ${title}`);
  console.log();
  for (const line of body.split("\n")) {
    console.log(`  ${line}`);
  }
  console.log();

  // ── Edit flow ──

  const shouldEdit = await confirm("Edit before creating?", false);
  if (shouldEdit) {
    const edited = openInEditor(title, body);
    title = edited.title;
    body = edited.body;

    console.log();
    console.log(`  ${BOLD}Title:${RESET} ${title}`);
    console.log();
    for (const line of body.split("\n")) {
      console.log(`  ${line}`);
    }
    console.log();
  }

  // ── Create PR ──

  if (dryRun) {
    info(`Dry run complete — no PR created. ${dim("(remove --dry-run to create)")}`);
    return;
  }

  const shouldCreate = await confirm("Create PR?", true);
  if (!shouldCreate) {
    info("Aborted.");
    return;
  }

  try {
    const url = createPr(title, body, baseBranch, draft);
    console.log();
    success(url);
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    warning(`Failed to create PR: ${e.message || String(err)}`);
    process.exit(1);
  }
}
