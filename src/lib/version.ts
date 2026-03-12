import { createRequire } from "node:module";

export function getVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require("../../package.json") as { version: string };
  return pkg.version;
}
