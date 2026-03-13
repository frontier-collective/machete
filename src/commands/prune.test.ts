import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { execSync } from "node:child_process";

// ── Test helpers ──────────────────────────────────────────────────────

let tempDir: string;
let bareRemote: string;
let origCwd: string;
let origHome: string;
let fakeHome: string;
let initialBranch: string;

function git(cmd: string, cwd?: string): string {
  return execSync(`git ${cmd}`, {
    cwd: cwd ?? tempDir,
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();
}

function createTestRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "machete-prune-test-"));

  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" });

  writeFileSync(join(dir, "file.txt"), "hello");
  execSync("git add -A && git commit -m 'init'", {
    cwd: dir,
    stdio: "pipe",
    shell: "/bin/sh",
  });

  initialBranch = execSync("git branch --show-current", {
    cwd: dir,
    encoding: "utf-8",
  }).trim();

  return dir;
}

function addBareRemote(dir: string): string {
  const remote = mkdtempSync(join(tmpdir(), "machete-prune-remote-"));
  execSync(`git clone --bare "${dir}" "${remote}"`, { stdio: "pipe" });
  execSync(`git remote add origin "${remote}"`, { cwd: dir, stdio: "pipe" });
  return remote;
}

function setupFakeHome(): { fakeHome: string; origHome: string } {
  const home = mkdtempSync(join(tmpdir(), "machete-home-"));
  const macheteDir = join(home, ".machete");
  mkdirSync(macheteDir, { recursive: true });
  writeFileSync(
    join(macheteDir, "macheterc"),
    JSON.stringify({ defaultRemote: "origin", protectedBranches: [initialBranch] })
  );
  return { fakeHome: home, origHome: homedir() };
}

beforeEach(() => {
  tempDir = createTestRepo();
  bareRemote = addBareRemote(tempDir);
  origCwd = process.cwd();
  process.chdir(tempDir);

  const homeSetup = setupFakeHome();
  fakeHome = homeSetup.fakeHome;
  origHome = homeSetup.origHome;
  process.env.HOME = fakeHome;

  // Create a .macheterc in the repo so config loads cleanly
  writeFileSync(
    join(tempDir, ".macheterc"),
    JSON.stringify({ defaultRemote: "origin", protectedBranches: [initialBranch] })
  );
});

afterEach(() => {
  process.chdir(origCwd);
  process.env.HOME = origHome;
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(bareRemote, { recursive: true, force: true });
  rmSync(fakeHome, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("prune safety classification", () => {
  it("classifies a pushed-and-merged branch as safe", async () => {
    const { classifyBranchSafety } = await import("../lib/git.js");

    // Create a branch, push it, merge it into initial branch
    git("checkout -b feature-done");
    writeFileSync(join(tempDir, "done.txt"), "done");
    git("add -A");
    git("commit -m 'feat: done'");
    git("push origin feature-done");

    git(`checkout ${initialBranch}`);
    git("merge --no-ff feature-done -m 'merge done'");

    const result = classifyBranchSafety("feature-done", [], "origin", [initialBranch]);
    assert.equal(result.safe, true);
    assert.equal(result.onRemote, true);
    assert.equal(result.unpushedCommitCount, 0);
    assert.equal(result.localOnlyCommitCount, 0);
  });

  it("classifies a never-pushed branch as unsafe", async () => {
    const { classifyBranchSafety } = await import("../lib/git.js");

    git("checkout -b feature-local");
    writeFileSync(join(tempDir, "local.txt"), "local");
    git("add -A");
    git("commit -m 'feat: local only'");
    git(`checkout ${initialBranch}`);

    const result = classifyBranchSafety("feature-local", [], "origin", [initialBranch]);
    assert.equal(result.safe, false);
    assert.equal(result.onRemote, false);
    assert.ok(result.unpushedCommitCount > 0);
  });

  it("classifies a pushed but locally-unmerged branch as unsafe", async () => {
    const { classifyBranchSafety } = await import("../lib/git.js");

    git("checkout -b feature-pushed-only");
    writeFileSync(join(tempDir, "pushed-only.txt"), "data");
    git("add -A");
    git("commit -m 'feat: pushed only'");
    git("push origin feature-pushed-only");
    git(`checkout ${initialBranch}`);

    // Pushed to remote but NOT merged into any other local branch
    const result = classifyBranchSafety("feature-pushed-only", [], "origin", [initialBranch]);
    assert.equal(result.safe, false);
    assert.equal(result.onRemote, true);
    assert.ok(result.localOnlyCommitCount > 0);
  });

  it("classifies a locally-merged but unpushed branch as unsafe", async () => {
    const { classifyBranchSafety } = await import("../lib/git.js");

    git("checkout -b feature-local-merge");
    writeFileSync(join(tempDir, "local-merge.txt"), "data");
    git("add -A");
    git("commit -m 'feat: local merge'");
    git(`checkout ${initialBranch}`);
    git("merge --no-ff feature-local-merge -m 'merge local'");

    // Merged locally but never pushed
    const result = classifyBranchSafety("feature-local-merge", [], "origin", [initialBranch]);
    assert.equal(result.safe, false);
    assert.equal(result.onRemote, false);
    assert.ok(result.unpushedCommitCount > 0);
  });

  it("considers prune set when checking local reachability", async () => {
    const { classifyBranchSafety } = await import("../lib/git.js");

    // Create branch-a
    git("checkout -b branch-a");
    writeFileSync(join(tempDir, "a.txt"), "a");
    git("add -A");
    git("commit -m 'feat: a'");
    git("push origin branch-a");

    // Create branch-b from branch-a (so b contains a's commits)
    git("checkout -b branch-b");
    writeFileSync(join(tempDir, "b.txt"), "b");
    git("add -A");
    git("commit -m 'feat: b'");
    git("push origin branch-b");

    git(`checkout ${initialBranch}`);

    // branch-a is pushed, and branch-b contains its commits
    // Without pruning branch-b, branch-a is safe
    const resultWithB = classifyBranchSafety("branch-a", [], "origin", [initialBranch]);
    assert.equal(resultWithB.safe, true);

    // When branch-b is also being pruned, branch-a becomes unsafe
    // because its only local harbor is being removed
    const resultWithoutB = classifyBranchSafety("branch-a", ["branch-b"], "origin", [initialBranch]);
    assert.equal(resultWithoutB.safe, false);
    assert.ok(resultWithoutB.localOnlyCommitCount > 0);
  });
});

describe("prune squash-merge detection", () => {
  it("classifies a squash-merged branch as safe", async () => {
    const { classifyBranchSafety } = await import("../lib/git.js");

    // Create feature branch with work
    git("checkout -b feature-squashed");
    writeFileSync(join(tempDir, "squash.txt"), "squash content");
    git("add -A");
    git("commit -m 'feat: to be squashed'");

    // Squash-merge into initial branch and push
    git(`checkout ${initialBranch}`);
    git("merge --squash feature-squashed");
    git("commit -m 'feat: squashed feature'");
    git(`push origin ${initialBranch}`);

    const result = classifyBranchSafety("feature-squashed", [], "origin", [initialBranch]);
    assert.equal(result.safe, true, "squash-merged branch should be safe to delete");
    assert.equal(result.onRemote, true, "patch-equivalent on remote should count as 'on remote'");
    assert.equal(result.localOnlyCommitCount, 0);
    assert.ok(result.squashMergedInto.length > 0, "should report squash-merge targets");
  });
});

describe("deleteBranchSafe", () => {
  it("deletes a branch that is merged into HEAD", async () => {
    const { deleteBranchSafe, getLocalBranches } = await import("../lib/git.js");

    git("checkout -b feature-merged");
    writeFileSync(join(tempDir, "merged.txt"), "data");
    git("add -A");
    git("commit -m 'feat: merged'");
    git(`checkout ${initialBranch}`);
    git("merge --no-ff feature-merged -m 'merge'");

    deleteBranchSafe("feature-merged");
    assert.ok(!getLocalBranches().includes("feature-merged"));
  });

  it("throws when deleting an unmerged branch", async () => {
    const { deleteBranchSafe } = await import("../lib/git.js");

    git("checkout -b feature-unmerged");
    writeFileSync(join(tempDir, "unmerged.txt"), "data");
    git("add -A");
    git("commit -m 'feat: unmerged'");
    git(`checkout ${initialBranch}`);

    assert.throws(() => deleteBranchSafe("feature-unmerged"));
  });
});
