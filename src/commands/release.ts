import type { ParsedArgs } from "../cli/args.js";
import type { ReleasePreviewJson } from "../lib/types.js";
import {
  isGitRepo,
  getCurrentBranch,
  isClean,
  createBranch,
  checkoutBranch,
  mergeNoFf,
  createTag,
  stageFiles,
  commitWithMessage,
  deleteBranch,
  pushWithTags,
  isGhInstalled,
  isGhAuthenticated,
  createGhRelease,
  uploadGhReleaseAsset,
  buildDmg,
  npmPublish,
  exec,
} from "../lib/git.js";
import { loadConfig } from "../lib/config.js";
import { getVersion } from "../lib/version.js";
import {
  gatherContext,
  generateChangelog,
  writeChangelog,
  extractReleaseNotes,
} from "../lib/changelog.js";
import { success, error, warning, info, dim, bold } from "../cli/format.js";
import { confirm, selectOne } from "../cli/prompt.js";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const VALID_BUMPS = ["patch", "minor", "major"] as const;
type Bump = (typeof VALID_BUMPS)[number];

function readVersionFromDisk(): string {
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  return pkg.version;
}

export function computeNextVersion(current: string, bump: Bump): string {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (bump) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
  }
}

function bumpVersion(bump: Bump): string {
  execSync(`npm version ${bump} --no-git-tag-version`, {
    encoding: "utf-8",
    stdio: "pipe",
  });
  return readVersionFromDisk();
}

export async function runRelease(args: ParsedArgs): Promise<void> {
  if (!isGitRepo()) {
    error("Not a git repository.");
    process.exit(1);
  }

  // JSON mode: return version preview
  if (args.json === true) {
    const current = readVersionFromDisk();
    const result: ReleasePreviewJson = {
      currentVersion: current,
      versions: {
        patch: computeNextVersion(current, "patch"),
        minor: computeNextVersion(current, "minor"),
        major: computeNextVersion(current, "major"),
      },
    };
    console.log(JSON.stringify(result));
    return;
  }

  let bump = args._[1] as Bump | undefined;
  if (bump && !VALID_BUMPS.includes(bump)) {
    error(`Invalid bump type ${bold(String(bump))}. Must be ${bold("patch")}, ${bold("minor")}, or ${bold("major")}.`);
    process.exit(1);
  }
  if (!bump) {
    const current = readVersionFromDisk();
    const choices = VALID_BUMPS.map(
      (b) => `${b}  ${current} → ${computeNextVersion(current, b)}`
    );
    const selected = await selectOne("Select release type:", choices);
    bump = selected.split(/\s+/)[0] as Bump;
  }

  const dryRun = args.dryRun === true;
  const noAi = args.noai === true;
  const noPublish = args.noPublish === true;

  // ── Pre-flight checks ──────────────────────────────────────────────

  const branch = getCurrentBranch();
  if (branch !== "develop") {
    error(`Must be on ${bold("develop")} branch (currently on ${bold(branch)}).`);
    process.exit(1);
  }

  if (!isClean()) {
    error("Working tree is dirty — commit or stash first.");
    process.exit(1);
  }

  const currentVersion = getVersion();
  info(`Current version: ${bold(`v${currentVersion}`)}`);

  // Build and test
  info("Running build...");
  try {
    execSync("npm run build --silent", { encoding: "utf-8", stdio: "pipe" });
    success("Build passed.");
  } catch {
    error("Build failed — aborting release.");
    process.exit(1);
  }

  info("Running tests...");
  try {
    execSync("npm test --silent", { encoding: "utf-8", stdio: "pipe" });
    success("Tests passed.");
  } catch {
    error("Tests failed — aborting release.");
    process.exit(1);
  }

  // ── Version bump ───────────────────────────────────────────────────

  const newVersion = dryRun ? computeNextVersion(currentVersion, bump) : bumpVersion(bump);
  const releaseBranch = `release/${newVersion}`;
  const tag = `v${newVersion}`;

  if (dryRun) {
    info(`Would bump ${bold(bump)}: v${currentVersion} → ${bold(tag)}`);
  } else {
    success(`Bumped to ${bold(tag)}`);
  }

  // ── Changelog generation ───────────────────────────────────────────

  const config = loadConfig();
  const ctx = gatherContext(newVersion);

  const notes = await generateChangelog(ctx, config.anthropicApiKey, noAi);
  if (notes === null) {
    error("Release aborted.");
    if (!dryRun) {
      // Revert version bump
      execSync(`npm version ${currentVersion} --no-git-tag-version --allow-same-version`, {
        encoding: "utf-8",
        stdio: "pipe",
      });
      info("Reverted version bump.");
    }
    process.exit(1);
  }

  writeChangelog(newVersion, notes, dryRun);

  if (dryRun) {
    info(`Dry run complete — no changes made. ${dim("(remove --dry-run to release)")}`);
    return;
  }

  // ── Git flow ───────────────────────────────────────────────────────

  createBranch(releaseBranch);
  info(`Created branch ${bold(releaseBranch)}`);

  stageFiles(["package.json", "package-lock.json", "CHANGELOG.md"]);
  commitWithMessage(`release: v${newVersion}`);

  checkoutBranch("master");
  mergeNoFf(releaseBranch, `Merge ${releaseBranch} into master`);
  createTag(tag, tag);
  success(`Tagged ${bold(tag)} on master`);

  checkoutBranch("develop");
  mergeNoFf(releaseBranch, `Merge ${releaseBranch} into develop`);
  deleteBranch(releaseBranch);

  success(`Released ${bold(tag)}`);
  console.log();

  // ── Push ───────────────────────────────────────────────────────────

  const shouldPush = await confirm(`Push master, develop, and tags to origin?`, true);
  if (shouldPush) {
    pushWithTags("origin", ["master", "develop"]);
    success("Pushed to origin.");
  } else {
    info(`Remember to push: ${dim("git push origin master develop --tags")}`);
  }

  if (noPublish) return;

  // ── GitHub release ─────────────────────────────────────────────────

  if (isGhInstalled() && isGhAuthenticated()) {
    const shouldGhRelease = await confirm(`Create GitHub release for ${tag}?`, true);
    if (shouldGhRelease) {
      const releaseNotes = extractReleaseNotes(newVersion);
      createGhRelease(tag, tag, releaseNotes);
      success(`Created GitHub release ${bold(tag)}`);

      // ── Desktop app DMG ───────────────────────────────────────────
      const shouldBuildDmg = await confirm(`Build and attach desktop app DMG to ${tag}?`, true);
      if (shouldBuildDmg) {
        try {
          info("Building DMG...");
          const dmgPath = buildDmg();
          uploadGhReleaseAsset(tag, dmgPath);
          success(`Attached DMG to release ${bold(tag)}`);
        } catch (e) {
          warning(`DMG build/upload failed: ${e instanceof Error ? e.message : String(e)}`);
          info(`Build manually with: ${dim(`make app-dmg && gh release upload ${tag} app/src-tauri/target/release/bundle/dmg/*.dmg`)}`);
        }
      }
    }
  } else if (!isGhInstalled()) {
    warning(`gh CLI not installed — skipping GitHub release.`);
    info(`Install from ${dim("https://cli.github.com")} and run ${bold(`gh release create ${tag}`)}`);
  } else {
    warning(`gh CLI not authenticated — skipping GitHub release.`);
    info(`Run ${bold("gh auth login")} first.`);
  }

  // ── npm publish ────────────────────────────────────────────────────

  const shouldNpmPublish = await confirm("Publish to npm?", true);
  if (shouldNpmPublish) {
    npmPublish();
    success(`Published ${bold(`@frontier-collective/machete@${newVersion}`)} to npm.`);
  } else {
    info(`Publish later with: ${dim("npm publish --access public --auth-type=web")}`);
  }
}
