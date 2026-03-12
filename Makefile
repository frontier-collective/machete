# Machete — Makefile
# Usage: make <target>
# Run `make help` for available targets.

.PHONY: help install setup build dev test clean \
        version release release-notes-preview release-notes-preview-noai gh-release npm-publish

# ─── Colours ──────────────────────────────────────────────────────────

CYAN    = \033[36m
GREEN   = \033[32m
YELLOW  = \033[33m
DIM     = \033[2m
BOLD    = \033[1m
RESET   = \033[0m

# ─── Configuration ────────────────────────────────────────────────────

VERSION = $(shell node -p "require('./package.json').version")

# ─── Help ─────────────────────────────────────────────────────────────

help: ## Show this help
	@printf '\n  $(BOLD)Machete$(RESET) $(DIM)v$(VERSION)$(RESET) — a sharp CLI toolset for managing git repositories\n\n'
	@awk 'BEGIN {FS = ":.*?## "} \
		/^##@/ { printf "\n  $(YELLOW)%s$(RESET)\n", substr($$0, 5) } \
		/^[a-zA-Z_-]+:.*?## / { printf "  $(CYAN)%-30s$(RESET) %s\n", $$1, $$2 }' \
		$(MAKEFILE_LIST)
	@printf '\n'

##@ Build & Test

install: ## Install npm dependencies
	@printf '  $(GREEN)Installing dependencies...$(RESET)\n'
	@npm install

setup: install build ## Install, build, and link globally
	@npm link
	@printf '  $(GREEN)Linked machete globally.$(RESET)\n'

build: ## Compile TypeScript to dist/
	@printf '  $(GREEN)Building...$(RESET)\n'
	@npm run build --silent

dev: ## Watch mode — recompile on changes
	npm run dev

test: ## Run tests
	@printf '  $(GREEN)Running tests...$(RESET)\n'
	@npm test

clean: ## Remove dist/
	@rm -rf dist/
	@printf '  $(GREEN)Cleaned.$(RESET)\n'

##@ Versioning

version: ## Show current version
	@printf '  $(CYAN)v$(VERSION)$(RESET)\n'

release-notes-preview: ## Preview release notes (dry run, with Claude AI)
	@if [ -f .env ]; then set -a; . ./.env; set +a; fi; \
	node scripts/changelog.mjs preview --dry-run

release-notes-preview-noai: ## Preview release notes (dry run, without Claude AI)
	@node scripts/changelog.mjs preview --dry-run --noai

release: ## Release: make release <patch|minor|major>
	@BUMP=$(filter patch minor major,$(MAKECMDGOALS)); \
	if [ -z "$$BUMP" ]; then \
		printf '  $(YELLOW)Usage: make release <patch|minor|major>$(RESET)\n'; \
		exit 1; \
	fi; \
	BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$BRANCH" != "develop" ]; then \
		printf '  $(YELLOW)Must be on develop branch (currently on %s)$(RESET)\n' "$$BRANCH"; \
		exit 1; \
	fi; \
	if [ -n "$$(git status --porcelain)" ]; then \
		printf '  $(YELLOW)Working tree is dirty — commit or stash first$(RESET)\n'; \
		exit 1; \
	fi; \
	printf '  $(YELLOW)Current version: v$(VERSION)$(RESET)\n'; \
	npm run build --silent; \
	npm test --silent 2>/dev/null || (printf '  $(YELLOW)Tests failed — aborting release$(RESET)\n' && exit 1); \
	npm version $$BUMP --no-git-tag-version > /dev/null; \
	NEW_VERSION=$$(node -p "require('./package.json').version"); \
	RELEASE_BRANCH="release/$$NEW_VERSION"; \
	printf '  $(GREEN)Bumped to v%s$(RESET)\n' "$$NEW_VERSION"; \
	git checkout -b "$$RELEASE_BRANCH"; \
	if [ -f .env ]; then set -a; . ./.env; set +a; fi; \
	node scripts/changelog.mjs "$$NEW_VERSION"; \
	git add package.json package-lock.json CHANGELOG.md; \
	git commit -m "release: v$$NEW_VERSION"; \
	git checkout master; \
	git merge --no-ff "$$RELEASE_BRANCH" -m "Merge $$RELEASE_BRANCH into master"; \
	git tag -a "v$$NEW_VERSION" -m "v$$NEW_VERSION"; \
	printf '  $(GREEN)Tagged v%s on master$(RESET)\n' "$$NEW_VERSION"; \
	git checkout develop; \
	git merge --no-ff "$$RELEASE_BRANCH" -m "Merge $$RELEASE_BRANCH into develop"; \
	git branch -d "$$RELEASE_BRANCH"; \
	printf '\n  $(GREEN)Released v%s$(RESET)\n' "$$NEW_VERSION"; \
	printf '\n  $(DIM)Next steps:$(RESET)\n'; \
	printf '    git push origin master develop --tags\n'; \
	printf '    make gh-release\n'; \
	printf '    make npm-publish\n'

gh-release: ## Create GitHub release (TAG=vX.Y.Z or pick from list)
	@if [ -n "$(TAG)" ]; then \
		SELECTED="$(TAG)"; \
	else \
		RELEASED=$$(gh release list --limit 100 --json tagName --jq '.[].tagName' 2>/dev/null); \
		UNRELEASED=""; \
		for t in $$(git tag --sort=-v:refname); do \
			if ! echo "$$RELEASED" | grep -qx "$$t"; then \
				UNRELEASED="$$UNRELEASED $$t"; \
			fi; \
		done; \
		UNRELEASED=$$(echo $$UNRELEASED | xargs); \
		if [ -z "$$UNRELEASED" ]; then printf '  $(GREEN)All tags have GitHub releases$(RESET)\n'; exit 0; fi; \
		printf '\n  $(BOLD)Tags without GitHub releases:$(RESET)\n'; \
		i=1; for t in $$UNRELEASED; do printf '  $(CYAN)%d)$(RESET) %s\n' $$i $$t; i=$$((i+1)); done; \
		printf '\n  Select [1]: '; read choice; \
		if [ -z "$$choice" ]; then choice=1; fi; \
		SELECTED=$$(echo "$$UNRELEASED" | tr ' ' '\n' | sed -n "$${choice}p"); \
		if [ -z "$$SELECTED" ]; then printf '  $(YELLOW)Invalid selection$(RESET)\n'; exit 1; fi; \
	fi; \
	VERSION=$${SELECTED#v}; \
	NOTES=$$(awk "/^## \[$$VERSION\]/{found=1; next} /^## \[/{if(found) exit} found" CHANGELOG.md | sed '/^$$/d'); \
	if [ -z "$$NOTES" ]; then NOTES="Release $$SELECTED"; fi; \
	printf '  $(GREEN)Creating GitHub release %s$(RESET)\n' "$$SELECTED"; \
	gh release create "$$SELECTED" --title "$$SELECTED" --notes "$$NOTES"

npm-publish: ## Publish to npm registry
	@printf '  $(GREEN)Publishing machete@$(VERSION) to npm...$(RESET)\n'
	@npm publish --access public --auth-type=web
	@printf '  $(GREEN)Published!$(RESET) Install with: npm install -g @frontier-collective/machete\n'

# Catch patch/minor/major as no-op targets so make doesn't error
patch minor major:
	@true
