import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { execSync } from "node:child_process";

// We test config by manipulating the filesystem and calling loadConfig etc.
// Config functions rely on isGitRepo/getRepoRoot which use git commands,
// so we create real temp git repos.

let tempDir: string;
let origCwd: string;
let origHome: string;
let fakeHome: string;

function createTempGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "machete-test-"));
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git commit --allow-empty -m 'init'", { cwd: dir, stdio: "pipe" });
  return dir;
}

function writeJson(path: string, data: Record<string, unknown>): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

beforeEach(() => {
  tempDir = createTempGitRepo();
  origCwd = process.cwd();
  origHome = process.env.HOME!;

  // Create a fake home so we don't touch real ~/.machete
  fakeHome = mkdtempSync(join(tmpdir(), "machete-home-"));
  mkdirSync(join(fakeHome, ".machete"), { recursive: true });
  process.env.HOME = fakeHome;

  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(origCwd);
  process.env.HOME = origHome;
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(fakeHome, { recursive: true, force: true });
});

// Dynamic import to pick up the patched HOME each time
async function importConfig() {
  // Node caches modules, so we need a cache-busting query param.
  // But since we're testing compiled JS in dist/, the HOME env var
  // is read at call time by homedir(), so a single import is fine.
  const mod = await import("./config.js");
  return mod;
}

describe("loadConfig", () => {
  it("returns defaults when no config files exist", async () => {
    const { loadConfig } = await importConfig();
    const config = loadConfig();
    assert.deepStrictEqual(config.protectedBranches, ["main", "master", "develop"]);
    assert.equal(config.defaultRemote, "origin");
    assert.equal(config.anthropicApiKey, undefined);
  });

  it("global config overrides defaults", async () => {
    const { loadConfig, globalConfigPath } = await importConfig();
    writeJson(globalConfigPath(), { defaultRemote: "upstream" });

    const config = loadConfig();
    assert.equal(config.defaultRemote, "upstream");
  });

  it("local config overrides global config", async () => {
    const { loadConfig, globalConfigPath, localConfigPath } = await importConfig();
    writeJson(globalConfigPath(), { defaultRemote: "upstream" });
    writeJson(localConfigPath()!, { defaultRemote: "fork" });

    const config = loadConfig();
    assert.equal(config.defaultRemote, "fork");
  });

  it("credentials merge in correct precedence", async () => {
    const { loadConfig, globalCredentialsPath, localCredentialsPath } = await importConfig();
    writeJson(globalCredentialsPath(), { anthropicApiKey: "global-key" });
    writeJson(localCredentialsPath()!, { anthropicApiKey: "local-key" });

    const config = loadConfig();
    assert.equal(config.anthropicApiKey, "local-key");
  });

  it("skips invalid JSON files silently", async () => {
    const { loadConfig, globalConfigPath } = await importConfig();
    writeFileSync(globalConfigPath(), "not valid json{{{");

    const config = loadConfig();
    // Should still return defaults without throwing
    assert.equal(config.defaultRemote, "origin");
  });
});

describe("writeConfigValue", () => {
  it("routes credential keys to local secrets file", async () => {
    const { writeConfigValue, localCredentialsPath } = await importConfig();
    const path = writeConfigValue("anthropicApiKey", "sk-test-123", false);

    assert.equal(path, localCredentialsPath());
    const data = JSON.parse(readFileSync(path, "utf-8"));
    assert.equal(data.anthropicApiKey, "sk-test-123");
  });

  it("routes non-credential keys to local config file", async () => {
    const { writeConfigValue, localConfigPath } = await importConfig();
    const path = writeConfigValue("defaultRemote", "upstream", false);

    assert.equal(path, localConfigPath());
    const data = JSON.parse(readFileSync(path, "utf-8"));
    assert.equal(data.defaultRemote, "upstream");
  });

  it("routes global credentials to global credentials file", async () => {
    const { writeConfigValue, globalCredentialsPath } = await importConfig();
    const path = writeConfigValue("githubToken", "gh-token", true);

    assert.equal(path, globalCredentialsPath());
    const data = JSON.parse(readFileSync(path, "utf-8"));
    assert.equal(data.githubToken, "gh-token");
  });

  it("routes global non-credential to global config file", async () => {
    const { writeConfigValue, globalConfigPath } = await importConfig();
    const path = writeConfigValue("defaultRemote", "upstream", true);

    assert.equal(path, globalConfigPath());
  });
});

describe("addToArray", () => {
  it("adds item to array", async () => {
    const { addToArray, localConfigPath } = await importConfig();
    addToArray("protectedBranches", "staging", false);

    const data = JSON.parse(readFileSync(localConfigPath()!, "utf-8"));
    assert.ok(data.protectedBranches.includes("staging"));
  });

  it("does not add duplicate item", async () => {
    const { addToArray, localConfigPath } = await importConfig();
    writeJson(localConfigPath()!, { protectedBranches: ["staging"] });

    addToArray("protectedBranches", "staging", false);

    const data = JSON.parse(readFileSync(localConfigPath()!, "utf-8"));
    assert.equal(data.protectedBranches.filter((b: string) => b === "staging").length, 1);
  });

  it("initializes array if key does not exist", async () => {
    const { addToArray, localConfigPath } = await importConfig();
    writeJson(localConfigPath()!, {});

    addToArray("protectedBranches", "release", false);

    const data = JSON.parse(readFileSync(localConfigPath()!, "utf-8"));
    assert.deepStrictEqual(data.protectedBranches, ["release"]);
  });
});

describe("removeFromArray", () => {
  it("removes item from array", async () => {
    const { removeFromArray, localConfigPath } = await importConfig();
    writeJson(localConfigPath()!, { protectedBranches: ["main", "staging"] });

    removeFromArray("protectedBranches", "staging", false);

    const data = JSON.parse(readFileSync(localConfigPath()!, "utf-8"));
    assert.deepStrictEqual(data.protectedBranches, ["main"]);
  });

  it("returns empty array when key does not exist", async () => {
    const { removeFromArray, localConfigPath } = await importConfig();
    writeJson(localConfigPath()!, {});

    removeFromArray("protectedBranches", "staging", false);

    const data = JSON.parse(readFileSync(localConfigPath()!, "utf-8"));
    assert.deepStrictEqual(data.protectedBranches, []);
  });
});
