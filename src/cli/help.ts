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
  ${GREEN}status${RESET}    Show repository status — branch, staged/unstaged files, ahead/behind ${DIM}(--json)${RESET}
  ${GREEN}commit${RESET}    Generate an AI commit message and commit staged changes ${DIM}(--dry-run)${RESET}
  ${GREEN}config${RESET}    Read or write configuration values ${DIM}(-g, --list, --add, --remove)${RESET}
  ${GREEN}prune${RESET}     Safely delete fully-merged local branches ${DIM}(--dry-run, -i, -n)${RESET}
  ${GREEN}pr${RESET}        Create a GitHub PR with AI-generated title and description ${DIM}(--draft, --dry-run, --noai)${RESET}
  ${GREEN}release${RESET}   Git-flow release with changelog, GH release, and npm publish ${DIM}(--dry-run, --noai, --no-publish)${RESET}
  ${GREEN}gui${RESET}       Launch the Machete desktop app

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

${BOLD}RELEASE USAGE${RESET}
  ${GREEN}machete release${RESET} ${YELLOW}<patch|minor|major>${RESET}
  ${GREEN}--dry-run${RESET}        Preview changelog and version bump without making changes
  ${GREEN}--noai${RESET}           Use raw git log instead of Claude for changelog
  ${GREEN}--no-publish${RESET}     Stop after push ${DIM}(skip GH release + npm publish)${RESET}

${BOLD}PR OPTIONS${RESET}
  ${GREEN}--draft${RESET}              Create as draft PR
  ${GREEN}--dry-run${RESET}            Preview without creating
  ${GREEN}--base${RESET} ${YELLOW}<branch>${RESET}       Override base branch ${DIM}(default: auto-detect from remote)${RESET}
  ${GREEN}--noai${RESET}               Skip AI generation, prompt for title/body manually
  ${GREEN}--title${RESET} ${YELLOW}<text>${RESET}        Override AI-generated title
  ${GREEN}--body${RESET} ${YELLOW}<text>${RESET}         Override AI-generated body

${BOLD}PRUNE OPTIONS${RESET}
  ${GREEN}--dry-run${RESET}            Show what would happen without deleting
  ${GREEN}--remote${RESET} ${YELLOW}<name>${RESET}      Remote to compare against ${DIM}(default: from machete config)${RESET}
  ${GREEN}-i, --interactive${RESET}    Select which branches to delete interactively
  ${GREEN}-n, --no-interaction${RESET} Skip confirmation prompt ${DIM}(for scripting)${RESET}

${BOLD}CONFIGURATION${RESET}
  Run ${GREEN}machete init${RESET} or create a ${CYAN}.macheterc${RESET} file in your repo root.
  Global config: ${CYAN}~/.machete/macheterc${RESET}  Credentials: ${CYAN}~/.machete/credentials${RESET}
  Local secrets: ${CYAN}.machete.env${RESET} ${DIM}(auto-created on first credential write)${RESET}

  Merge order: defaults -> global config -> global credentials -> local config -> local secrets
`);
}
