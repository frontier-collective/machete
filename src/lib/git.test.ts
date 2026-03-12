import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

let tempDir: string;
let origCwd: string;

let initialBranch: string;

function createTempGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "machete-git-test-"));
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "file.txt"), "hello");
  execSync("git add -A && git commit -m 'init'", { cwd: dir, stdio: "pipe", shell: "/bin/sh" });
  initialBranch = execSync("git branch --show-current", { cwd: dir, encoding: "utf-8" }).trim();
  return dir;
}

beforeEach(() => {
  tempDir = createTempGitRepo();
  origCwd = process.cwd();
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

async function importGit() {
  return await import("./git.js");
}

describe("isGitRepo", () => {
  it("returns true inside a git repo", async () => {
    const { isGitRepo } = await importGit();
    assert.equal(isGitRepo(), true);
  });

  it("returns false outside a git repo", async () => {
    const nonGit = mkdtempSync(join(tmpdir(), "machete-nogit-"));
    process.chdir(nonGit);
    try {
      const { isGitRepo } = await importGit();
      assert.equal(isGitRepo(), false);
    } finally {
      process.chdir(origCwd);
      rmSync(nonGit, { recursive: true, force: true });
    }
  });
});

describe("getLocalBranches", () => {
  it("returns the default branch", async () => {
    const { getLocalBranches } = await importGit();
    const branches = getLocalBranches();
    assert.ok(branches.length >= 1);
    // Should contain the initial branch (master or main depending on git config)
    assert.ok(branches.some((b) => b === "master" || b === "main"));
  });

  it("includes newly created branches", async () => {
    execSync("git checkout -b feature-test", { cwd: tempDir, stdio: "pipe" });
    const { getLocalBranches } = await importGit();
    const branches = getLocalBranches();
    assert.ok(branches.includes("feature-test"));
  });
});

describe("getCurrentBranch", () => {
  it("returns the current branch name", async () => {
    execSync("git checkout -b my-branch", { cwd: tempDir, stdio: "pipe" });
    const { getCurrentBranch } = await importGit();
    assert.equal(getCurrentBranch(), "my-branch");
  });
});

describe("getStagedFiles / getUnstagedFiles", () => {
  it("returns empty arrays when nothing is changed", async () => {
    const { getStagedFiles, getUnstagedFiles } = await importGit();
    assert.deepStrictEqual(getStagedFiles(), []);
    assert.deepStrictEqual(getUnstagedFiles(), []);
  });

  it("detects staged files", async () => {
    writeFileSync(join(tempDir, "new.txt"), "new");
    execSync("git add new.txt", { cwd: tempDir, stdio: "pipe" });
    const { getStagedFiles } = await importGit();
    assert.ok(getStagedFiles().includes("new.txt"));
  });

  it("detects unstaged modified files", async () => {
    writeFileSync(join(tempDir, "file.txt"), "changed");
    const { getUnstagedFiles } = await importGit();
    assert.ok(getUnstagedFiles().includes("file.txt"));
  });

  it("detects untracked files", async () => {
    writeFileSync(join(tempDir, "untracked.txt"), "new");
    const { getUnstagedFiles } = await importGit();
    assert.ok(getUnstagedFiles().includes("untracked.txt"));
  });

  it("deduplicates modified + untracked", async () => {
    // A file can't be both modified and untracked, but the function
    // combines two git commands — verify no duplicates in output
    writeFileSync(join(tempDir, "file.txt"), "changed");
    writeFileSync(join(tempDir, "new.txt"), "new");
    const { getUnstagedFiles } = await importGit();
    const files = getUnstagedFiles();
    const unique = [...new Set(files)];
    assert.equal(files.length, unique.length);
  });
});

describe("getStagedDiff", () => {
  it("returns diff for staged changes", async () => {
    writeFileSync(join(tempDir, "file.txt"), "changed content");
    execSync("git add file.txt", { cwd: tempDir, stdio: "pipe" });
    const { getStagedDiff } = await importGit();
    const diff = getStagedDiff();
    assert.ok(diff.includes("changed content"));
  });

  it("returns empty string when nothing is staged", async () => {
    const { getStagedDiff } = await importGit();
    assert.equal(getStagedDiff(), "");
  });
});

describe("isClean", () => {
  it("returns true on clean working tree", async () => {
    const { isClean } = await importGit();
    assert.equal(isClean(), true);
  });

  it("returns false with uncommitted changes", async () => {
    writeFileSync(join(tempDir, "dirty.txt"), "dirty");
    const { isClean } = await importGit();
    assert.equal(isClean(), false);
  });
});

describe("commitWithMessage", () => {
  it("creates a commit with the given message", async () => {
    writeFileSync(join(tempDir, "commit-test.txt"), "data");
    execSync("git add commit-test.txt", { cwd: tempDir, stdio: "pipe" });
    const { commitWithMessage } = await importGit();
    commitWithMessage("test: add commit-test file");
    const log = execSync("git log -1 --pretty=format:%s", { cwd: tempDir, encoding: "utf-8" });
    assert.equal(log, "test: add commit-test file");
  });

  it("handles multiline messages", async () => {
    writeFileSync(join(tempDir, "multi.txt"), "data");
    execSync("git add multi.txt", { cwd: tempDir, stdio: "pipe" });
    const { commitWithMessage } = await importGit();
    commitWithMessage("feat: add feature\n\nThis is a detailed body.");
    const log = execSync("git log -1 --pretty=format:%B", { cwd: tempDir, encoding: "utf-8" }).trim();
    assert.ok(log.includes("feat: add feature"));
    assert.ok(log.includes("This is a detailed body."));
  });
});

describe("createBranch / checkoutBranch / deleteBranch", () => {
  it("creates, switches, and deletes a branch", async () => {
    const { createBranch, checkoutBranch, deleteBranch, getLocalBranches, getCurrentBranch } = await importGit();

    createBranch("test-branch");
    assert.equal(getCurrentBranch(), "test-branch");

    checkoutBranch(initialBranch);
    assert.equal(getCurrentBranch(), initialBranch);

    assert.ok(getLocalBranches().includes("test-branch"));
    deleteBranch("test-branch");
    assert.ok(!getLocalBranches().includes("test-branch"));
  });
});

describe("mergeNoFf", () => {
  it("creates a merge commit with the given message", async () => {
    const { createBranch, checkoutBranch, mergeNoFf } = await importGit();

    createBranch("feature");
    writeFileSync(join(tempDir, "feature.txt"), "feature work");
    execSync("git add -A && git commit -m 'feat: work'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    checkoutBranch(initialBranch);
    mergeNoFf("feature", "Merge feature into " + initialBranch);

    const log = execSync("git log -1 --pretty=format:%s", { cwd: tempDir, encoding: "utf-8" });
    assert.ok(log.startsWith("Merge feature into "));
  });
});

describe("createTag", () => {
  it("creates an annotated tag", async () => {
    const { createTag } = await importGit();
    createTag("v1.0.0", "Release v1.0.0");

    const tags = execSync("git tag", { cwd: tempDir, encoding: "utf-8" }).trim();
    assert.ok(tags.includes("v1.0.0"));

    const message = execSync("git tag -l -n1 v1.0.0", { cwd: tempDir, encoding: "utf-8" });
    assert.ok(message.includes("Release v1.0.0"));
  });
});

describe("getRootCommit / getLatestTag", () => {
  it("returns the root commit hash", async () => {
    const { getRootCommit } = await importGit();
    const root = getRootCommit();
    assert.ok(root.length >= 7); // short hash at minimum
  });

  it("returns empty string when no tags exist", async () => {
    const { getLatestTag } = await importGit();
    assert.equal(getLatestTag(), "");
  });

  it("returns the latest tag", async () => {
    const { createTag, getLatestTag } = await importGit();
    createTag("v0.1.0", "v0.1.0");
    createTag("v0.2.0", "v0.2.0");
    assert.equal(getLatestTag(), "v0.2.0");
  });
});
