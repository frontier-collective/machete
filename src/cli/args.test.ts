import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("collects positional args in _", () => {
    const result = parseArgs(["release", "minor"]);
    assert.deepStrictEqual(result._, ["release", "minor"]);
  });

  it("parses long flag with space value", () => {
    const result = parseArgs(["--remote", "origin"]);
    assert.equal(result.remote, "origin");
  });

  it("parses long flag with = value", () => {
    const result = parseArgs(["--remote=origin"]);
    assert.equal(result.remote, "origin");
  });

  it("parses long flag with no value as boolean true", () => {
    const result = parseArgs(["--force"]);
    assert.equal(result.force, true);
  });

  it("converts kebab-case to camelCase", () => {
    const result = parseArgs(["--dry-run"]);
    assert.equal(result.dryRun, true);
  });

  it("converts multi-hyphen kebab-case", () => {
    const result = parseArgs(["--api-key-name", "foo"]);
    assert.equal(result.apiKeyName, "foo");
  });

  it("parses short flag with value", () => {
    const result = parseArgs(["-r", "upstream"]);
    assert.equal(result.r, "upstream");
  });

  it("parses short flag with no value as boolean true", () => {
    const result = parseArgs(["-i"]);
    assert.equal(result.i, true);
  });

  it("handles mixed positional and flags", () => {
    const result = parseArgs(["prune", "--dry-run", "--remote", "origin"]);
    assert.deepStrictEqual(result._, ["prune"]);
    assert.equal(result.dryRun, true);
    assert.equal(result.remote, "origin");
  });

  it("returns empty _ for empty argv", () => {
    const result = parseArgs([]);
    assert.deepStrictEqual(result._, []);
  });

  it("treats consecutive flags as booleans (no value consumed)", () => {
    const result = parseArgs(["--foo", "--bar"]);
    assert.equal(result.foo, true);
    assert.equal(result.bar, true);
  });

  it("does not consume short flag as value for preceding long flag", () => {
    const result = parseArgs(["--foo", "-x"]);
    assert.equal(result.foo, true);
    assert.equal(result.x, true);
  });

  it("handles = with value containing =", () => {
    const result = parseArgs(["--key=foo=bar"]);
    assert.equal(result.key, "foo=bar");
  });

  it("treats multi-char short args as positional", () => {
    // -ab has length 3, not handled as short flag
    const result = parseArgs(["-ab"]);
    assert.deepStrictEqual(result._, ["-ab"]);
  });
});
