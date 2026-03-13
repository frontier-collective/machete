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
  const dir = mkdtempSync(join(tmpdir(), "machete-pr-test-"));
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "file.txt"), "hello");
  execSync("git add -A && git commit -m 'init'", { cwd: dir, stdio: "pipe", shell: "/bin/sh" });
  initialBranch = execSync("git branch --show-current", { cwd: dir, encoding: "utf-8" }).trim();
  return dir;
}

function createBareRemote(): string {
  const bareDir = mkdtempSync(join(tmpdir(), "machete-pr-remote-"));
  execSync(`git clone --bare "${tempDir}" "${bareDir}"`, { stdio: "pipe" });
  execSync(`git remote add origin "${bareDir}"`, { cwd: tempDir, stdio: "pipe" });
  return bareDir;
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
  return await import("../lib/git.js");
}

describe("getCommitsSinceBase", () => {
  it("returns commits between base and HEAD", async () => {
    execSync("git checkout -b feature-test", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "a.txt"), "a");
    execSync("git add -A && git commit -m 'feat: a'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });
    writeFileSync(join(tempDir, "b.txt"), "b");
    execSync("git add -A && git commit -m 'feat: b'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    const { getCommitsSinceBase } = await importGit();
    const commits = getCommitsSinceBase(initialBranch);
    assert.equal(commits.length, 2);
  });

  it("returns empty when no commits since base", async () => {
    const { getCommitsSinceBase } = await importGit();
    const commits = getCommitsSinceBase(initialBranch);
    assert.equal(commits.length, 0);
  });
});

describe("getCommitMessagesSinceBase", () => {
  it("returns formatted commit messages", async () => {
    execSync("git checkout -b feature-msgs", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "msg.txt"), "msg");
    execSync("git add -A && git commit -m 'feat: message test'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    const { getCommitMessagesSinceBase } = await importGit();
    const log = getCommitMessagesSinceBase(initialBranch);
    assert.ok(log.includes("feat: message test"));
  });
});

describe("getDiffStatSinceBase", () => {
  it("returns diff stat summary", async () => {
    execSync("git checkout -b feature-stat", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "stat.txt"), "stats content");
    execSync("git add -A && git commit -m 'feat: stat'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    const { getDiffStatSinceBase } = await importGit();
    const stat = getDiffStatSinceBase(initialBranch);
    assert.ok(stat.includes("stat.txt"));
    assert.ok(stat.includes("1 file changed"));
  });
});

describe("getDiffFilesSinceBase", () => {
  it("returns per-file diff stats", async () => {
    execSync("git checkout -b feature-files", { cwd: tempDir, stdio: "pipe" });
    writeFileSync(join(tempDir, "new-file.txt"), "line1\nline2\nline3\n");
    execSync("git add -A && git commit -m 'feat: files'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

    const { getDiffFilesSinceBase } = await importGit();
    const files = getDiffFilesSinceBase(initialBranch);
    assert.equal(files.length, 1);
    assert.equal(files[0].file, "new-file.txt");
    assert.equal(files[0].added, 3);
    assert.equal(files[0].removed, 0);
    assert.equal(files[0].binary, false);
  });
});

describe("branchExistsOnRemote", () => {
  it("returns true for a pushed branch", async () => {
    const bareDir = createBareRemote();
    try {
      execSync("git checkout -b feature-remote", { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "remote.txt"), "remote");
      execSync("git add -A && git commit -m 'feat: remote'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });
      execSync("git push origin feature-remote", { cwd: tempDir, stdio: "pipe" });

      const { branchExistsOnRemote } = await importGit();
      assert.equal(branchExistsOnRemote("feature-remote", "origin"), true);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it("returns false for a local-only branch", async () => {
    const bareDir = createBareRemote();
    try {
      execSync("git checkout -b feature-local-only", { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "local.txt"), "local");
      execSync("git add -A && git commit -m 'feat: local'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

      const { branchExistsOnRemote } = await importGit();
      assert.equal(branchExistsOnRemote("feature-local-only", "origin"), false);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });
});

describe("isBranchUpToDateWithRemote", () => {
  it("returns true when branch matches remote", async () => {
    const bareDir = createBareRemote();
    try {
      execSync("git checkout -b feature-synced", { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "synced.txt"), "synced");
      execSync("git add -A && git commit -m 'feat: synced'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });
      execSync("git push origin feature-synced", { cwd: tempDir, stdio: "pipe" });
      execSync("git fetch origin", { cwd: tempDir, stdio: "pipe" });

      const { isBranchUpToDateWithRemote } = await importGit();
      assert.equal(isBranchUpToDateWithRemote("feature-synced", "origin"), true);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it("returns false when local is ahead", async () => {
    const bareDir = createBareRemote();
    try {
      execSync("git checkout -b feature-ahead", { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "ahead1.txt"), "ahead1");
      execSync("git add -A && git commit -m 'feat: ahead 1'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });
      execSync("git push origin feature-ahead", { cwd: tempDir, stdio: "pipe" });
      execSync("git fetch origin", { cwd: tempDir, stdio: "pipe" });

      // Make another commit locally
      writeFileSync(join(tempDir, "ahead2.txt"), "ahead2");
      execSync("git add -A && git commit -m 'feat: ahead 2'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

      const { isBranchUpToDateWithRemote } = await importGit();
      assert.equal(isBranchUpToDateWithRemote("feature-ahead", "origin"), false);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });
});

describe("getCommitCountAheadOfRemote", () => {
  it("returns correct count of commits ahead", async () => {
    const bareDir = createBareRemote();
    try {
      execSync("git checkout -b feature-count", { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "c1.txt"), "c1");
      execSync("git add -A && git commit -m 'feat: c1'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });
      execSync("git push origin feature-count", { cwd: tempDir, stdio: "pipe" });
      execSync("git fetch origin", { cwd: tempDir, stdio: "pipe" });

      writeFileSync(join(tempDir, "c2.txt"), "c2");
      execSync("git add -A && git commit -m 'feat: c2'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });
      writeFileSync(join(tempDir, "c3.txt"), "c3");
      execSync("git add -A && git commit -m 'feat: c3'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

      const { getCommitCountAheadOfRemote } = await importGit();
      assert.equal(getCommitCountAheadOfRemote("feature-count", "origin"), 2);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });
});

describe("pushBranch", () => {
  it("pushes branch to remote", async () => {
    const bareDir = createBareRemote();
    try {
      execSync("git checkout -b feature-push", { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "push.txt"), "push");
      execSync("git add -A && git commit -m 'feat: push'", { cwd: tempDir, stdio: "pipe", shell: "/bin/sh" });

      const { pushBranch, branchExistsOnRemote } = await importGit();
      pushBranch("feature-push", "origin");

      assert.equal(branchExistsOnRemote("feature-push", "origin"), true);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });
});
