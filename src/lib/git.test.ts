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

function createBareRemote(): string {
  const bareDir = mkdtempSync(join(tmpdir(), "machete-remote-"));
  execSync(`git clone --bare "${tempDir}" "${bareDir}"`, { stdio: "pipe" });
  execSync(`git remote add origin "${bareDir}"`, { cwd: tempDir, stdio: "pipe" });
  return bareDir;
}

describe("getUnpushedCommits", () => {
  it("returns empty when branch is fully pushed", async () => {
    const bareDir = createBareRemote();
    try {
      execSync("git checkout -b feature-pushed", { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "pushed.txt"), "data");
      execSync("git add -A && git commit -m 'feat: pushed'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });
      execSync("git push origin feature-pushed", { cwd: tempDir, stdio: "pipe" });

      const { getUnpushedCommits } = await importGit();
      assert.deepStrictEqual(getUnpushedCommits("feature-pushed"), []);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it("returns commits when branch was never pushed", async () => {
    createBareRemote();
    execSync("git checkout -b feature-local", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "local.txt"), "data");
    execSync("git add -A && git commit -m 'feat: local only'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    const { getUnpushedCommits } = await importGit();
    const unpushed = getUnpushedCommits("feature-local");
    assert.ok(unpushed.length > 0);
  });
});

describe("getCommitsNotOnOtherBranches", () => {
  it("returns empty when commits are on another branch", async () => {
    execSync("git checkout -b feature-merged", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "merged.txt"), "data");
    execSync("git add -A && git commit -m 'feat: merged'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    execSync(`git checkout ${initialBranch}`, { cwd: tempDir, stdio: "pipe" });
    execSync("git merge --no-ff feature-merged -m 'merge'", { cwd: tempDir, stdio: "pipe" });

    const { getCommitsNotOnOtherBranches } = await importGit();
    const localOnly = getCommitsNotOnOtherBranches("feature-merged", []);
    assert.deepStrictEqual(localOnly, []);
  });

  it("returns commits when they only exist on this branch", async () => {
    execSync("git checkout -b feature-solo", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "solo.txt"), "data");
    execSync("git add -A && git commit -m 'feat: solo'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    const { getCommitsNotOnOtherBranches } = await importGit();
    const localOnly = getCommitsNotOnOtherBranches("feature-solo", []);
    assert.ok(localOnly.length > 0);
  });

  it("excludes branches in the prune set from harbor check", async () => {
    // Create branch A
    execSync("git checkout -b branch-a", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "a.txt"), "data");
    execSync("git add -A && git commit -m 'feat: a'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    // Create branch B from A (so B contains A's commits)
    execSync("git checkout -b branch-b", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "b.txt"), "data");
    execSync("git add -A && git commit -m 'feat: b'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    execSync(`git checkout ${initialBranch}`, { cwd: tempDir, stdio: "pipe" });

    const { getCommitsNotOnOtherBranches } = await importGit();

    // Without excluding branch-b, branch-a's commits are reachable from branch-b
    const withB = getCommitsNotOnOtherBranches("branch-a", []);
    assert.deepStrictEqual(withB, []);

    // When branch-b is also being pruned, branch-a's commits are local-only
    const withoutB = getCommitsNotOnOtherBranches("branch-a", ["branch-b"]);
    assert.ok(withoutB.length > 0);
  });
});

describe("classifyBranchSafety", () => {
  it("marks a fully merged and pushed branch as safe", async () => {
    const bareDir = createBareRemote();
    try {
      execSync("git checkout -b feature-safe", { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "safe.txt"), "data");
      execSync("git add -A && git commit -m 'feat: safe'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });
      execSync("git push origin feature-safe", { cwd: tempDir, stdio: "pipe" });

      execSync(`git checkout ${initialBranch}`, { cwd: tempDir, stdio: "pipe" });
      execSync("git merge --no-ff feature-safe -m 'merge safe'", { cwd: tempDir, stdio: "pipe" });

      const { classifyBranchSafety } = await importGit();
      const result = classifyBranchSafety("feature-safe", [], "origin", [initialBranch]);
      assert.equal(result.safe, true);
      assert.equal(result.onRemote, true);
      assert.equal(result.unpushedCommitCount, 0);
      assert.equal(result.localOnlyCommitCount, 0);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it("marks a never-pushed branch as unsafe", async () => {
    createBareRemote();
    execSync("git checkout -b feature-unpushed", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "unpushed.txt"), "data");
    execSync("git add -A && git commit -m 'feat: unpushed'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    execSync(`git checkout ${initialBranch}`, { cwd: tempDir, stdio: "pipe" });

    const { classifyBranchSafety } = await importGit();
    const result = classifyBranchSafety("feature-unpushed", [], "origin", [initialBranch]);
    assert.equal(result.safe, false);
    assert.equal(result.onRemote, false);
    assert.ok(result.unpushedCommitCount > 0);
  });

  it("detects squash-merged branches as safe", async () => {
    const bareDir = createBareRemote();
    try {
      // Create feature branch with a commit
      execSync("git checkout -b feature-squashed", { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "squashed.txt"), "squash content");
      execSync("git add -A && git commit -m 'feat: to be squashed'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

      // Switch to initial branch and squash-merge (creates a new commit with same patch)
      execSync(`git checkout ${initialBranch}`, { cwd: tempDir, stdio: "pipe" });
      execSync("git merge --squash feature-squashed", { cwd: tempDir, stdio: "pipe" });
      execSync("git commit -m 'feat: squashed feature'", { cwd: tempDir, stdio: "pipe" });

      // Push the squash-merged initial branch to remote
      execSync(`git push origin ${initialBranch}`, { cwd: tempDir, stdio: "pipe" });

      const { classifyBranchSafety } = await importGit();
      const result = classifyBranchSafety("feature-squashed", [], "origin", [initialBranch]);
      assert.equal(result.safe, true, "squash-merged branch should be safe");
      assert.equal(result.onRemote, true, "patch-equivalent should be detected on remote");
      assert.equal(result.unpushedCommitCount, 0);
      assert.equal(result.localOnlyCommitCount, 0);
      assert.ok(result.squashMergedInto.length > 0, "should report squash-merge targets");
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it("detects locally squash-merged branches as safe", async () => {
    const bareDir = createBareRemote();
    try {
      // Create feature branch with a commit
      execSync("git checkout -b feature-local-squash", { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "local-squash.txt"), "local squash content");
      execSync("git add -A && git commit -m 'feat: local squash'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

      // Push the feature branch so it's "on remote" by hash
      execSync("git push origin feature-local-squash", { cwd: tempDir, stdio: "pipe" });

      // Squash-merge into initial branch locally (but don't push)
      execSync(`git checkout ${initialBranch}`, { cwd: tempDir, stdio: "pipe" });
      execSync("git merge --squash feature-local-squash", { cwd: tempDir, stdio: "pipe" });
      execSync("git commit -m 'feat: squashed locally'", { cwd: tempDir, stdio: "pipe" });

      // Now delete the remote branch to simulate post-PR cleanup
      execSync("git push origin --delete feature-local-squash", { cwd: tempDir, stdio: "pipe" });

      // feature-local-squash: hash-unpushed (remote branch deleted), hash-local-only
      // But patch-equivalent exists on initial branch locally
      const { classifyBranchSafety } = await importGit();
      const result = classifyBranchSafety("feature-local-squash", [], "origin", [initialBranch]);
      // The branch was pushed then deleted — commits aren't on remote by hash
      // But the squash commit on initialBranch has the same patch
      // localOnlyCommitCount should be 0 because initialBranch has the equivalent
      assert.equal(result.localOnlyCommitCount, 0, "patch-equivalent on local branch should count");
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });
});

describe("deleteBranchSafe", () => {
  it("deletes a merged branch", async () => {
    execSync("git checkout -b feature-to-delete", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "del.txt"), "data");
    execSync("git add -A && git commit -m 'feat: del'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    execSync(`git checkout ${initialBranch}`, { cwd: tempDir, stdio: "pipe" });
    execSync("git merge --no-ff feature-to-delete -m 'merge del'", { cwd: tempDir, stdio: "pipe" });

    const { deleteBranchSafe, getLocalBranches } = await importGit();
    deleteBranchSafe("feature-to-delete");
    assert.ok(!getLocalBranches().includes("feature-to-delete"));
  });

  it("refuses to delete an unmerged branch", async () => {
    execSync("git checkout -b feature-unmerged", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "unmerged.txt"), "data");
    execSync("git add -A && git commit -m 'feat: unmerged'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    execSync(`git checkout ${initialBranch}`, { cwd: tempDir, stdio: "pipe" });

    const { deleteBranchSafe } = await importGit();
    assert.throws(() => deleteBranchSafe("feature-unmerged"));
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
