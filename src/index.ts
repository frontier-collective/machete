#!/usr/bin/env node

import { parseArgs } from "./cli/args.js";
import { printHelp } from "./cli/help.js";
import { getVersion } from "./lib/version.js";

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

if (args.version || args.v) {
  console.log(getVersion());
  process.exit(0);
}

if (args.help || args.h || command === "help") {
  printHelp();
  process.exit(0);
}

if (!command) {
  printHelp();
  process.exit(0);
}

switch (command) {
  case "init": {
    const { runInit } = await import("./commands/init.js");
    await runInit();
    break;
  }
  case "commit": {
    const { runCommit } = await import("./commands/commit.js");
    await runCommit(args);
    break;
  }
  case "config": {
    const { runConfig } = await import("./commands/config.js");
    await runConfig(args);
    break;
  }
  case "release": {
    const { runRelease } = await import("./commands/release.js");
    await runRelease(args);
    break;
  }
  case "prune": {
    const { runPrune } = await import("./commands/prune.js");
    await runPrune(args);
    break;
  }
  default:
    console.error(`Unknown command: ${command}`);
    console.error(`Run "machete help" for usage information.`);
    process.exit(1);
}
