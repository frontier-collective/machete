#!/usr/bin/env node

// scripts/postinstall.mjs
// Creates ~/.machete/ directory on install.
// Cross-platform: works on Linux, macOS, and Windows.

import { mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const macheteDir = join(homedir(), ".machete");

try {
  mkdirSync(macheteDir, { recursive: true });
} catch (err) {
  // Only warn — don't fail the install
  console.error(`machete: could not create ${macheteDir}: ${err.message}`);
}
