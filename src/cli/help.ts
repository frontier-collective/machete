import { getVersion } from "../lib/version.js";

const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export function printHelp(): void {
  const version = getVersion();

  console.log(`
${BOLD}${CYAN}machete${RESET} ${DIM}v${version}${RESET}
${DIM}A sharp CLI toolset for managing git repositories${RESET}

${BOLD}USAGE${RESET}
  ${GREEN}machete${RESET} ${YELLOW}<command>${RESET} [options]

${BOLD}COMMANDS${RESET}
  ${GREEN}init${RESET}      Initialize .macheterc in the current repository
  ${GREEN}commit${RESET}    Generate an AI commit message and commit staged changes ${DIM}(--dry-run)${RESET}
  ${GREEN}config${RESET}    Read or write configuration values ${DIM}(-g, --list, --add, --remove)${RESET}
  ${GREEN}prune${RESET}     Delete local branches with no remote equivalent ${DIM}(--dry-run, --force, -i)${RESET}

${BOLD}OPTIONS${RESET}
  ${GREEN}-h, --help${RESET}       Show this help message
  ${GREEN}-v, --version${RESET}    Show version number

${BOLD}COMMIT OPTIONS${RESET}
  ${GREEN}--dry-run${RESET}        Generate message and show what would be committed without committing

${BOLD}CONFIG USAGE${RESET}
  ${GREEN}machete config${RESET} ${YELLOW}<key>${RESET}                    Read a value
  ${GREEN}machete config${RESET} ${YELLOW}<key> <value>${RESET}            Set a value
  ${GREEN}machete config${RESET} ${YELLOW}<key>${RESET} --add ${YELLOW}<value>${RESET}     Add to an array
  ${GREEN}machete config${RESET} ${YELLOW}<key>${RESET} --remove ${YELLOW}<value>${RESET}  Remove from an array
  ${GREEN}machete config${RESET} --list                  Show all with sources
  ${DIM}Use -g to write to global config (~/.machete/)${RESET}

${BOLD}PRUNE OPTIONS${RESET}
  ${GREEN}--dry-run${RESET}        Show branches that would be deleted without deleting
  ${GREEN}--force${RESET}          Skip confirmation prompt
  ${GREEN}--remote${RESET} ${YELLOW}<name>${RESET}  Remote to compare against ${DIM}(default: origin)${RESET}
  ${GREEN}-i, --interactive${RESET} Select which branches to delete interactively

${BOLD}CONFIGURATION${RESET}
  Run ${GREEN}machete init${RESET} or create a ${CYAN}.macheterc${RESET} file in your repo root.
  Global config: ${CYAN}~/.machete/macheterc${RESET}  Credentials: ${CYAN}~/.machete/credentials${RESET}
  Local secrets: ${CYAN}.machete.env${RESET} ${DIM}(auto-created on first credential write)${RESET}

  Merge order: defaults -> global config -> global credentials -> local config -> local secrets
`);
}
