const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export function success(msg: string): void {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

export function warning(msg: string): void {
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${RED}✗${RESET} ${msg}`);
}

export function info(msg: string): void {
  console.log(`${CYAN}ℹ${RESET} ${msg}`);
}

export function dim(msg: string): string {
  return `${DIM}${msg}${RESET}`;
}

export function bold(msg: string): string {
  return `${BOLD}${msg}${RESET}`;
}

export function branchList(branches: string[], prefix = ""): void {
  for (const branch of branches) {
    console.log(`${prefix}${RED}•${RESET} ${branch}`);
  }
}

export function protectedBranchList(branches: string[], prefix = ""): void {
  for (const branch of branches) {
    console.log(`${prefix}${GREEN}✓${RESET} ${DIM}${branch} (protected)${RESET}`);
  }
}
