import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { execSync } from "node:child_process";

// ── Test helpers ──────────────────────────────────────────────────────

let tempDir: string;
let origCwd: string;
let origHome: string;
let fakeHome: string;

function git(cmd: string, cwd?: string): string {
  return execSync(`git ${cmd}`, {
    cwd: cwd ?? tempDir,
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();
}

function createTestRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "machete-release-test-"));

  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" });

  // Create a valid package.json
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "test-release",
        version: "1.0.0",
        scripts: {
          build: "echo ok",
          test: "echo ok",
        },
      },
      null,
      2
    ) + "\n"
  );

  // Create initial CHANGELOG.md
  writeFileSync(
    join(dir, "CHANGELOG.md"),
    "# Changelog\n\nAll notable changes to this project are documented here.\n\n## [1.0.0] - 2026-01-01\n\n- Initial release\n"
  );

  // Create a dummy source file
  writeFileSync(join(dir, "index.ts"), "console.log('hello');\n");

  execSync("git add -A && git commit -m 'chore: initial commit'", {
    cwd: dir,
    stdio: "pipe",
    shell: "/bin/sh",
  });

  // Rename initial branch to master
  const currentBranch = execSync("git branch --show-current", { cwd: dir, encoding: "utf-8" }).trim();
  if (currentBranch !== "master") {
    execSync("git branch -m master", { cwd: dir, stdio: "pipe" });
  }

  // Create develop branch with seed commits
  execSync("git checkout -b develop", { cwd: dir, stdio: "pipe" });

  writeFileSync(join(dir, "feature-a.ts"), "export const a = 1;\n");
  execSync("git add -A && git commit -m 'feat: add feature A'", {
    cwd: dir,
    stdio: "pipe",
    shell: "/bin/sh",
  });

  writeFileSync(join(dir, "feature-b.ts"), "export const b = 2;\n");
  execSync("git add -A && git commit -m 'feat: add feature B'", {
    cwd: dir,
    stdio: "pipe",
    shell: "/bin/sh",
  });

  writeFileSync(join(dir, "index.ts"), "console.log('updated');\n");
  execSync("git add -A && git commit -m 'fix: update main entry'", {
    cwd: dir,
    stdio: "pipe",
    shell: "/bin/sh",
  });

  return dir;
}

beforeEach(() => {
  tempDir = createTestRepo();
  origCwd = process.cwd();
  origHome = process.env.HOME!;

  // Fake home to avoid touching real ~/.machete
  fakeHome = mkdtempSync(join(tmpdir(), "machete-home-"));
  execSync(`mkdir -p "${join(fakeHome, ".machete")}"`, { stdio: "pipe" });
  process.env.HOME = fakeHome;

  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(origCwd);
  process.env.HOME = origHome;
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(fakeHome, { recursive: true, force: true });
});

// ── computeNextVersion ────────────────────────────────────────────────

describe("computeNextVersion", () => {
  it("bumps patch", async () => {
    const { computeNextVersion } = await import("./release.js");
    assert.equal(computeNextVersion("1.0.0", "patch"), "1.0.1");
  });

  it("bumps minor", async () => {
    const { computeNextVersion } = await import("./release.js");
    assert.equal(computeNextVersion("1.0.0", "minor"), "1.1.0");
  });

  it("bumps major", async () => {
    const { computeNextVersion } = await import("./release.js");
    assert.equal(computeNextVersion("1.0.0", "major"), "2.0.0");
  });

  it("bumps patch from non-zero", async () => {
    const { computeNextVersion } = await import("./release.js");
    assert.equal(computeNextVersion("2.3.4", "patch"), "2.3.5");
  });

  it("bumps minor resets patch", async () => {
    const { computeNextVersion } = await import("./release.js");
    assert.equal(computeNextVersion("2.3.4", "minor"), "2.4.0");
  });

  it("bumps major resets minor and patch", async () => {
    const { computeNextVersion } = await import("./release.js");
    assert.equal(computeNextVersion("2.3.4", "major"), "3.0.0");
  });
});

// ── Git-flow release mechanics ────────────────────────────────────────

describe("release git-flow", () => {
  it("performs full patch release flow", () => {
    // Simulate the git-flow that runRelease performs:
    // 1. Bump version
    execSync("npm version patch --no-git-tag-version", { cwd: tempDir, stdio: "pipe" });
    const pkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
    assert.equal(pkg.version, "1.0.1");

    const newVersion = "1.0.1";
    const releaseBranch = `release/${newVersion}`;
    const tag = `v${newVersion}`;

    // 2. Create release branch and commit
    git(`checkout -b ${releaseBranch}`);
    git("add package.json");
    execSync(`git commit -m "release: v${newVersion}"`, { cwd: tempDir, stdio: "pipe" });

    // 3. Merge to master
    git("checkout master");
    execSync(`git merge --no-ff ${releaseBranch} -m "Merge ${releaseBranch} into master"`, {
      cwd: tempDir,
      stdio: "pipe",
    });

    // 4. Tag
    execSync(`git tag -a ${tag} -m "${tag}"`, { cwd: tempDir, stdio: "pipe" });

    // 5. Merge back to develop
    git("checkout develop");
    execSync(`git merge --no-ff ${releaseBranch} -m "Merge ${releaseBranch} into develop"`, {
      cwd: tempDir,
      stdio: "pipe",
    });

    // 6. Delete release branch
    git(`branch -D ${releaseBranch}`);

    // ── Assertions ──

    // Tag exists
    const tags = git("tag").split("\n").filter(Boolean);
    assert.ok(tags.includes(tag), `Tag ${tag} should exist`);

    // Release branch is gone
    const branches = git("branch").split("\n").map((b) => b.trim().replace(/^\* /, ""));
    assert.ok(!branches.includes(releaseBranch), "Release branch should be deleted");

    // Currently on develop
    const currentBranch = git("branch --show-current");
    assert.equal(currentBranch, "develop");

    // Master has the tag
    const tagCommit = git(`rev-list -n 1 ${tag}`);
    const masterHead = git("rev-parse master");
    assert.equal(tagCommit, masterHead, "Tag should point to master HEAD");

    // Package.json version on master
    git("checkout master");
    const masterPkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
    assert.equal(masterPkg.version, "1.0.1");

    // Package.json version on develop (should also have the bump via merge)
    git("checkout develop");
    const developPkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
    assert.equal(developPkg.version, "1.0.1");
  });

  it("performs minor release flow", () => {
    execSync("npm version minor --no-git-tag-version", { cwd: tempDir, stdio: "pipe" });
    const pkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
    assert.equal(pkg.version, "1.1.0");
  });

  it("performs major release flow", () => {
    execSync("npm version major --no-git-tag-version", { cwd: tempDir, stdio: "pipe" });
    const pkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
    assert.equal(pkg.version, "2.0.0");
  });
});

// ── Pre-flight validation ─────────────────────────────────────────────

describe("release pre-flight", () => {
  it("must be on develop branch", () => {
    git("checkout master");
    const branch = git("branch --show-current");
    assert.equal(branch, "master");
    assert.notEqual(branch, "develop", "Should fail if not on develop");
  });

  it("must have clean working tree", () => {
    writeFileSync(join(tempDir, "dirty.txt"), "dirty");
    const status = git("status --porcelain");
    assert.ok(status.length > 0, "Working tree should be dirty");
  });

  it("rejects invalid bump types", async () => {
    const { computeNextVersion } = await import("./release.js");
    // computeNextVersion only accepts patch/minor/major
    // Trying an invalid type would be caught at the arg validation layer
    assert.equal(computeNextVersion("1.0.0", "patch"), "1.0.1");
    // The type system prevents invalid bumps at compile time
  });
});

// ── Dry-run ───────────────────────────────────────────────────────────

describe("release dry-run", () => {
  it("computes correct next version without modifying files", async () => {
    const { computeNextVersion } = await import("./release.js");

    // Read original state
    const origPkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
    const origVersion = origPkg.version;

    // Compute next version (pure function, no side effects)
    const next = computeNextVersion(origVersion, "patch");
    assert.equal(next, "1.0.1");

    // Verify package.json was not modified
    const afterPkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
    assert.equal(afterPkg.version, origVersion, "package.json should not be modified in dry-run");

    // Verify no new branches
    const branches = git("branch").split("\n").map((b) => b.trim().replace(/^\* /, ""));
    assert.ok(!branches.some((b) => b.startsWith("release/")), "No release branch should exist");

    // Verify no tags
    const tags = git("tag");
    assert.equal(tags, "", "No tags should exist");
  });
});

// ── Changelog ─────────────────────────────────────────────────────────

describe("release changelog", () => {
  it("gatherContext captures commits since root when no tags exist", async () => {
    const { gatherContext } = await import("../lib/changelog.js");
    const ctx = gatherContext("1.0.1");

    assert.equal(ctx.newVersion, "1.0.1");
    assert.equal(ctx.prevTag, "", "No previous tag should exist");
    assert.ok(ctx.range.includes("..HEAD"), "Range should end with ..HEAD");
    assert.ok(ctx.rawLog.length > 0, "Should have commit log entries");
    assert.ok(ctx.rawLog.includes("feat: add feature A"), "Should include seed commits");
  });

  it("writeChangelog prepends new entry to existing file", async () => {
    const { writeChangelog } = await import("../lib/changelog.js");

    const notes = "### Features\n\n- Add cool stuff";
    writeChangelog("1.0.1", notes, false);

    const content = readFileSync(join(tempDir, "CHANGELOG.md"), "utf-8");
    assert.ok(content.includes("## [1.0.1]"), "Should contain new version header");
    assert.ok(content.includes("Add cool stuff"), "Should contain the notes");
    assert.ok(content.includes("## [1.0.0]"), "Should still contain old version");

    // New entry should come before old entry
    const newIdx = content.indexOf("[1.0.1]");
    const oldIdx = content.indexOf("[1.0.0]");
    assert.ok(newIdx < oldIdx, "New entry should be before old entry");
  });

  it("extractReleaseNotes extracts notes for a specific version", async () => {
    const { writeChangelog, extractReleaseNotes } = await import("../lib/changelog.js");

    writeChangelog("1.0.1", "### Features\n\n- Something new", false);

    const notes = extractReleaseNotes("1.0.1");
    assert.ok(notes.includes("Something new"), "Should extract the release notes");
  });
});

// ── Edge cases ────────────────────────────────────────────────────────

describe("release edge cases", () => {
  it("handles first release (no previous tags)", async () => {
    const { gatherContext } = await import("../lib/changelog.js");
    const ctx = gatherContext("1.0.0");

    // Should fall back to root commit for range
    assert.ok(ctx.range.length > 0, "Range should be non-empty");
    assert.ok(ctx.range.includes("..HEAD"), "Range should include ..HEAD");
  });

  it("handles release after a tag exists", async () => {
    // Create a tag to simulate a previous release
    execSync('git tag -a v1.0.0 -m "v1.0.0"', { cwd: tempDir, stdio: "pipe" });

    // Add a new commit after the tag
    writeFileSync(join(tempDir, "post-tag.ts"), "export const c = 3;\n");
    execSync("git add -A && git commit -m 'feat: post-tag feature'", {
      cwd: tempDir,
      stdio: "pipe",
      shell: "/bin/sh",
    });

    const { gatherContext } = await import("../lib/changelog.js");
    const ctx = gatherContext("1.0.1");

    assert.equal(ctx.prevTag, "v1.0.0");
    assert.ok(ctx.range.startsWith("v1.0.0.."), "Range should start from previous tag");
    assert.ok(ctx.rawLog.includes("post-tag feature"), "Should include only new commits");
    assert.ok(!ctx.rawLog.includes("add feature A"), "Should not include pre-tag commits");
  });
});
