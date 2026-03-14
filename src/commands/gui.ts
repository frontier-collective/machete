import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedArgs } from "../cli/args.js";
import { error, info, bold, dim } from "../cli/format.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_DIR = resolve(__dirname, "../../app");

const APP_PATHS = [
  "/Applications/Machete.app",
  `${process.env.HOME}/Applications/Machete.app`,
];

function findApp(): string | null {
  // Check standard install locations
  for (const p of APP_PATHS) {
    if (existsSync(p)) return p;
  }

  // Check development build relative to this CLI package
  const devApp = resolve(__dirname, "../../app/src-tauri/target/release/bundle/macos/Machete.app");
  if (existsSync(devApp)) return devApp;

  const devBinary = resolve(__dirname, "../../app/src-tauri/target/release/machete-app");
  if (existsSync(devBinary)) return devBinary;

  return null;
}

export async function runGui(args: ParsedArgs): Promise<void> {
  const dev = args.dev === true;

  if (dev) {
    if (!existsSync(APP_DIR)) {
      error("App directory not found.");
      info(`Expected at: ${bold(APP_DIR)}`);
      process.exit(1);
    }
    info(`Starting Tauri dev server with hot reload ${dim(`(${APP_DIR})`)}`);
    info(dim("Vite HMR for frontend • auto-recompile for Rust"));
    const PATH = `${process.env.HOME}/.cargo/bin:${process.env.PATH}`;
    execSync("npx tauri dev", { cwd: APP_DIR, stdio: "inherit", env: { ...process.env, PATH } });
    return;
  }

  const appPath = findApp();

  if (!appPath) {
    error("Machete GUI not found.");
    info(`Expected at: ${bold("/Applications/Machete.app")}`);
    info(`Build it with: ${bold("cd app && npx tauri build")}`);
    process.exit(1);
  }

  if (appPath.endsWith(".app")) {
    execSync(`open "${appPath}"`, { stdio: "inherit" });
  } else {
    execSync(`"${appPath}" &`, { stdio: "inherit", shell: "/bin/sh" });
  }
}
