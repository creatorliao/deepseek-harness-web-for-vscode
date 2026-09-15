# DeepSeek Harness for VS Code — task automation
# Tokens are read from the environment only (already exported in ~/.zshrc);
# this file stores no secrets. Every recipe that uses a token starts with @
# so the command line (and the token value) is never echoed to the terminal.
#
# NOTE: this Makefile is POSIX/bash-only (SHELL/test/rm). On Windows run it from
# Git Bash / WSL, or call the equivalent npm script directly.
# NOTE: the VS Code Marketplace half of the publish targets is currently
# unavailable — the listing was removed on 2026-08-26 and is not reinstated.
# Use `make publish-ovsx`. See docs/02-Areas/20260914-07-发布与版本规范.md.

SHELL := /bin/bash
NPM := npm --cache .npm-cache
VERSION ?= $(shell node -p "require('./package.json').version")
VSIX ?= $(shell node -p "const p=require('./package.json'); 'dist/'+p.publisher+'.'+p.name+'-'+p.version+'.vsix'")

.PHONY: help install compile watch test package publish publish-vscode publish-ovsx publish-vscode-only publish-ovsx-only namespace tag clean

help: ## List all tasks
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-16s %s\n", $$1, $$2}'

install: ## Install dependencies (cached into .npm-cache)
	$(NPM) install

compile: ## Compile TypeScript (tsc strict)
	$(NPM) run compile

watch: ## Watch and recompile
	$(NPM) run watch

test: ## Run unit tests (compiles first; node:test)
	$(NPM) test

package: compile ## Build the vsix into dist/ (exactly one file, version in the name)
	$(NPM) run package

# -- Publishing (tokens from env vars; fail loudly when missing) ------------
# publish = one package build, then both channels. The per-channel targets also
# build the vsix when invoked standalone, so each stays single-entry usable.

publish: package ## Publish to both channels (Marketplace + Open VSX)
	@$(MAKE) publish-vscode-only publish-ovsx-only

publish-vscode: package ## Publish to VS Code Marketplace (needs VSCE_PAT or a prior `vsce login`)
	@$(MAKE) publish-vscode-only

publish-vscode-only: ## (internal) Publish prebuilt vsix to Marketplace — no package rebuild
	@if [ -n "$$VSCE_PAT" ]; then \
		npx --no-install vsce publish --packagePath $(VSIX) --pat "$$VSCE_PAT"; \
	else \
		npx --no-install vsce publish --packagePath $(VSIX); \
	fi

publish-ovsx: package ## Publish to Open VSX (needs OVSX_TOKEN, exported in ~/.zshrc)
	@$(MAKE) publish-ovsx-only

publish-ovsx-only: ## (internal) Publish prebuilt vsix to Open VSX — no package rebuild
	@test -n "$$OVSX_TOKEN" || { echo "Error: OVSX_TOKEN is not set (see docs/02-Areas/20260914-08-Open-VSX发布手册.md)"; exit 1; }
	@npx --yes ovsx publish $(VSIX) -p "$$OVSX_TOKEN"

namespace: ## Create the Open VSX namespace (needs OVSX_TOKEN)
	@test -n "$$OVSX_TOKEN" || { echo "Error: OVSX_TOKEN is not set"; exit 1; }
	@npx --yes ovsx create-namespace creatorliao -p "$$OVSX_TOKEN"

tag: ## Create git tag v<version> (does not push)
	git tag v$(VERSION)

clean: ## Remove build artifacts (dist / out)
	rm -rf dist
	rm -rf out
