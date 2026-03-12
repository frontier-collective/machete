import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  getLatestTag,
  getRootCommit,
  getCommitLog,
  getCommitMessages,
  getDiffStat,
  getFullDiff,
} from "./git.js";
import { success, warning, info, dim } from "../cli/format.js";
import { confirm } from "../cli/prompt.js";

export interface ChangelogContext {
  newVersion: string;
  prevTag: string;
  range: string;
  commitMessages: string;
  rawLog: string;
  diffStat: string;
  fullDiff: string;
}

export function gatherContext(newVersion: string): ChangelogContext {
  const prevTag = getLatestTag();
  const rangeBase = prevTag || getRootCommit();
  const range = rangeBase ? `${rangeBase}..HEAD` : "";

  return {
    newVersion,
    prevTag,
    range,
    commitMessages: getCommitMessages(range || "HEAD"),
    rawLog: getCommitLog(range || "HEAD"),
    diffStat: getDiffStat(range || "HEAD"),
    fullDiff: getFullDiff(range || "HEAD"),
  };
}

function buildPrompt(ctx: ChangelogContext): string {
  return `You are generating release notes for Machete v${ctx.newVersion}.

Machete is a CLI git toolset for managing repositories — pruning stale branches, AI-powered commits, and more. It is published as @frontier-collective/machete on npm. The previous version was ${ctx.prevTag || "unknown"}.

Here are the commits in this release:

${ctx.commitMessages}

Here is the diff stat:

${ctx.diffStat}

${ctx.fullDiff ? `Here is the full diff of source changes:\n\n${ctx.fullDiff}` : ""}

Write concise, polished release notes. Group changes into these sections (omit empty sections):

### Features
### Improvements
### Fixes
### Documentation
### Internal

Rules:
- Write from the user's perspective — what changed for them, not implementation details
- Each bullet should be one line, starting with a verb (Add, Fix, Improve, Update, Remove)
- Don't include commit hashes
- Don't include the version header — I'll add that myself
- Be concise — aim for 1-2 sentences per bullet maximum
- Combine related commits into single bullets where it makes sense
- Skip trivial changes (typo fixes, formatting) unless they're the only changes`;
}

async function generateWithClaude(apiKey: string, ctx: ChangelogContext): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: buildPrompt(ctx) }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response format from Anthropic API.");
  }

  return block.text;
}

export async function generateChangelog(
  ctx: ChangelogContext,
  apiKey: string | undefined,
  noAi: boolean,
): Promise<string | null> {
  if (noAi || !apiKey) {
    if (!apiKey) {
      warning("No Anthropic API key configured — using raw git log for changelog.");
    }
    return ctx.rawLog;
  }

  info("Generating release notes with Claude...");

  try {
    return await generateWithClaude(apiKey, ctx);
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    warning(`Claude API failed: ${e.message || String(err)}`);

    const useFallback = await confirm("Use raw git log instead?");
    if (!useFallback) {
      return null;
    }

    return ctx.rawLog;
  }
}

export function writeChangelog(newVersion: string, body: string, dryRun: boolean): void {
  const date = new Date().toISOString().split("T")[0];
  const header = `## [${newVersion}] - ${date}`;
  const newEntry = `${header}\n\n${body}`;
  const changelogPath = "CHANGELOG.md";
  const preamble = "# Changelog\n\nAll notable changes to Machete are documented here.\n";

  if (dryRun) {
    console.log();
    console.log(newEntry);
    console.log();
    info(`Dry run — CHANGELOG.md not updated. ${dim("(remove --dry-run to write)")}`);
    return;
  }

  console.log();
  console.log(newEntry);
  console.log();

  if (existsSync(changelogPath)) {
    const existing = readFileSync(changelogPath, "utf-8");
    const content = existing.replace(
      /^# Changelog\n\n(?:All notable changes[^\n]*\n)?/,
      `${preamble}\n${newEntry}\n\n`
    );
    writeFileSync(changelogPath, content);
  } else {
    writeFileSync(changelogPath, `${preamble}\n${newEntry}\n`);
  }

  success("Updated CHANGELOG.md");
}

export function extractReleaseNotes(version: string): string {
  const changelogPath = "CHANGELOG.md";
  if (!existsSync(changelogPath)) return `Release v${version}`;

  const content = readFileSync(changelogPath, "utf-8");
  const regex = new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\].*$`, "m");
  const start = content.search(regex);
  if (start === -1) return `Release v${version}`;

  const afterHeader = content.indexOf("\n", start) + 1;
  const nextSection = content.indexOf("\n## [", afterHeader);
  const notes = nextSection === -1
    ? content.slice(afterHeader)
    : content.slice(afterHeader, nextSection);

  return notes.trim() || `Release v${version}`;
}
