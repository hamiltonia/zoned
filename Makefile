.PHONY: help install uninstall enable disable reload logs compile-schema test clean build \
        vm-install clean-install vm-clean-install lint lint-strict lint-fix dev reinstall dev-version test-release

# Detect OS for sed compatibility
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
    SED_INPLACE = sed -i ''
else
    SED_INPLACE = sed -i
endif

# Extension details
EXTENSION_UUID = zoned@hamiltonia.me
EXTENSION_DIR = extension
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)

# Colors for output (use printf for reliable interpretation)
COLOR_RESET = \033[0m
COLOR_INFO = \033[36m
COLOR_SUCCESS = \033[32m
COLOR_ERROR = \033[31m
COLOR_WARN = \033[33m

.NOTPARALLEL: help

help:
	@printf "$(COLOR_INFO)Zoned GNOME Shell Extension - Makefile Commands$(COLOR_RESET)\n"
	@printf "\n"
	@printf "$(COLOR_SUCCESS)Installation:$(COLOR_RESET)\n"
	@printf "  make install        - Install extension to local extensions directory\n"
	@printf "  make uninstall      - Remove extension from local extensions directory\n"
	@printf "  make enable         - Enable the extension\n"
	@printf "  make disable        - Disable the extension\n"
	@printf "\n"
	@printf "$(COLOR_SUCCESS)Development:$(COLOR_RESET)\n"
	@printf "  make reload         - Reload extension (note Wayland limitations)\n"
	@printf "  make logs           - Follow extension logs\n"
	@printf "  make compile-schema - Compile GSettings schema\n"
	@printf "  make dev            - Full development setup (install + compile + enable)\n"
	@printf "  make lint           - Run ESLint on extension code\n"
	@printf "  make lint-fix       - Run ESLint and auto-fix issues\n"
	@printf "  make test           - Run tests\n"
	@printf "\n"
	@printf "$(COLOR_SUCCESS)VM Development:$(COLOR_RESET)\n"
	@printf "  make vm-install     - Install extension to VM (lint + sync + enable)\n"
	@printf "\n"
	@printf "$(COLOR_INFO)For VM operations (setup, logs, testing, etc.):$(COLOR_RESET)\n"
	@printf "  Use: $(COLOR_SUCCESS)./scripts/vm --help$(COLOR_RESET)\n"
	@printf "  Or set up an alias: $(COLOR_SUCCESS)alias vm='./scripts/vm'$(COLOR_RESET)\n"
	@printf "  Then: $(COLOR_SUCCESS)vm setup, vm logs, vm profile list, vm test func$(COLOR_RESET), etc.\n"
	@printf "\n"
	@printf "$(COLOR_SUCCESS)Build/Packaging:$(COLOR_RESET)\n"
	@printf "  make build          - Create extension zip for distribution\n"
	@printf "  make clean          - Clean build artifacts\n"
	@printf "\n"
	@printf "$(COLOR_SUCCESS)Diagnostic/Deep Clean:$(COLOR_RESET)\n"
	@printf "  make clean-install     - Deep clean local installation (extension + settings)\n"
	@printf "  make vm-clean-install  - Deep clean VM installation (extension + settings)\n"
	@printf "\n"

install: dev-version
	@printf "$(COLOR_INFO)Installing Zoned extension...$(COLOR_RESET)\n"
	@mkdir -p $(INSTALL_DIR)
	@cp -r $(EXTENSION_DIR)/* $(INSTALL_DIR)/
	@printf "$(COLOR_SUCCESS)✓ Installation complete: $(INSTALL_DIR)$(COLOR_RESET)\n"
	@printf "$(COLOR_INFO)  Note: Schema will be compiled by GNOME Shell when enabling extension$(COLOR_RESET)\n"
	@printf "$(COLOR_INFO)  Tip: Enable debug logging in Preferences → Developer section (Ctrl+Shift+D)$(COLOR_RESET)\n"

uninstall:
	@printf "$(COLOR_INFO)Uninstalling Zoned extension...$(COLOR_RESET)\n"
	@rm -rf $(INSTALL_DIR)
	@printf "$(COLOR_SUCCESS)✓ Uninstalled successfully$(COLOR_RESET)\n"

enable:
	@printf "$(COLOR_INFO)Enabling Zoned extension...$(COLOR_RESET)\n"
	@gnome-extensions enable $(EXTENSION_UUID)
	@printf "$(COLOR_SUCCESS)✓ Extension enabled$(COLOR_RESET)\n"

disable:
	@printf "$(COLOR_INFO)Disabling Zoned extension...$(COLOR_RESET)\n"
	@gnome-extensions disable $(EXTENSION_UUID)
	@printf "$(COLOR_SUCCESS)✓ Extension disabled$(COLOR_RESET)\n"

reload:
	@printf "$(COLOR_INFO)Attempting to reload extension...$(COLOR_RESET)\n"
	@if [ "$$XDG_SESSION_TYPE" = "wayland" ]; then \
		printf "$(COLOR_WARN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(COLOR_RESET)\n"; \
		printf "$(COLOR_WARN)⚠  WAYLAND LIMITATION$(COLOR_RESET)\n"; \
		printf "$(COLOR_WARN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(COLOR_RESET)\n"; \
		printf "Wayland does not support reloading GNOME Shell.\n"; \
		printf "\n"; \
		printf "$(COLOR_INFO)To test your changes:$(COLOR_RESET)\n"; \
		printf "  1. Log out (top right menu → Power → Log Out)\n"; \
		printf "  2. Log back in\n"; \
		printf "\n"; \
		printf "$(COLOR_INFO)For faster development:$(COLOR_RESET)\n"; \
		printf "  • Switch to X11: Logout → Click gear at login → 'GNOME on Xorg'\n"; \
		printf "  • On X11: Alt+F2 → type 'r' → Enter (2 second reload)\n"; \
		printf "$(COLOR_WARN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(COLOR_RESET)\n"; \
		exit 1; \
	else \
		printf "$(COLOR_INFO)Detected X11 session - restarting GNOME Shell...$(COLOR_RESET)\n"; \
		gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval 'Meta.restart("Restarting…")' > /dev/null 2>&1 || \
			(printf "$(COLOR_ERROR)Failed to reload via D-Bus. Try: Alt+F2 → type 'r' → Enter$(COLOR_RESET)\n" && exit 1); \
		printf "$(COLOR_SUCCESS)✓ GNOME Shell restarted$(COLOR_RESET)\n"; \
	fi

logs:
	@printf "$(COLOR_INFO)Following Zoned logs (Ctrl+C to stop)...$(COLOR_RESET)\n"
	@printf "$(COLOR_WARN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(COLOR_RESET)\n"
	@journalctl -f -o cat /usr/bin/gnome-shell 2>/dev/null | grep --line-buffered -i zoned || \
		(printf "$(COLOR_ERROR)Error: Unable to access GNOME Shell logs$(COLOR_RESET)\n" && exit 1)

compile-schema:
	@printf "$(COLOR_INFO)Compiling GSettings schema...$(COLOR_RESET)\n"
	@if [ -d "$(INSTALL_DIR)/schemas" ]; then \
		glib-compile-schemas $(INSTALL_DIR)/schemas/; \
		printf "$(COLOR_SUCCESS)✓ Schema compiled successfully$(COLOR_RESET)\n"; \
	else \
		printf "$(COLOR_ERROR)✗ Extension not installed. Run 'make install' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi

test:
	@printf "$(COLOR_INFO)Running tests...$(COLOR_RESET)\n"
	@printf "$(COLOR_WARN)⚠ No tests implemented yet$(COLOR_RESET)\n"

lint:
	@printf "$(COLOR_INFO)Running ESLint on extension code...$(COLOR_RESET)\n"
	@if [ ! -d "node_modules" ]; then \
		printf "$(COLOR_WARN)Installing npm dependencies...$(COLOR_RESET)\n"; \
		npm install --silent; \
	fi
	@npm run lint

lint-strict:
	@printf "$(COLOR_INFO)Running ESLint (strict mode - no warnings allowed)...$(COLOR_RESET)\n"
	@if [ ! -d "node_modules" ]; then \
		printf "$(COLOR_WARN)Installing npm dependencies...$(COLOR_RESET)\n"; \
		npm install --silent; \
	fi
	@npm run lint -- --max-warnings 0

lint-fix:
	@printf "$(COLOR_INFO)Running ESLint with auto-fix...$(COLOR_RESET)\n"
	@if [ ! -d "node_modules" ]; then \
		printf "$(COLOR_WARN)Installing npm dependencies...$(COLOR_RESET)\n"; \
		npm install --silent; \
	fi
	@npm run lint:fix

# Generate dev version override (auto-marked as development build)
dev-version:
	@printf "$(COLOR_INFO)Generating dev version override...$(COLOR_RESET)\n"
	@mkdir -p $(EXTENSION_DIR)
	@jq -r '."version-name"' $(EXTENSION_DIR)/metadata.json | awk '{print $$1"-dev-"strftime("%Y%m%d-%H%M%S")}' > $(EXTENSION_DIR)/.version-override
	@printf "$(COLOR_SUCCESS)✓ Dev version: $$(cat $(EXTENSION_DIR)/.version-override)$(COLOR_RESET)\n"

clean:
	@printf "$(COLOR_INFO)Cleaning build artifacts...$(COLOR_RESET)\n"
	@rm -f *.zip
	@find . -name "*.gschema.compiled" -delete
	@rm -rf build/ dist/
	@rm -f $(EXTENSION_DIR)/.version-override
	@printf "$(COLOR_SUCCESS)✓ Clean complete$(COLOR_RESET)\n"

# Build target (creates distributable zip)
build: lint-strict
	@printf "$(COLOR_INFO)Creating extension package...$(COLOR_RESET)\n"
	@mkdir -p build/prod
	@cp -r $(EXTENSION_DIR)/* build/prod/
	@rm -f build/prod/.version-override
	@cd build/prod && zip -r ../$(EXTENSION_UUID).zip . -x "*.git*"
	@printf "$(COLOR_SUCCESS)✓ Package created: build/$(EXTENSION_UUID).zip$(COLOR_RESET)\n"
	@printf "$(COLOR_INFO)  Note: Debug logging controlled via GSettings (default: disabled)$(COLOR_RESET)\n"

# Convenience target for development workflow
dev: lint install enable
	@printf "$(COLOR_SUCCESS)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(COLOR_RESET)\n"
	@printf "$(COLOR_SUCCESS)✓ Development setup complete!$(COLOR_RESET)\n"
	@printf "$(COLOR_SUCCESS)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(COLOR_RESET)\n"
	@printf "\n"
	@printf "$(COLOR_INFO)Extension installed and enabled.$(COLOR_RESET)\n"
	@printf "\n"
	@if [ "$$XDG_SESSION_TYPE" = "wayland" ]; then \
		printf "$(COLOR_WARN)⚠  You're on Wayland - You must LOG OUT and LOG BACK IN to test changes.$(COLOR_RESET)\n"; \
		printf "\n"; \
		printf "$(COLOR_INFO)Tip:$(COLOR_RESET) For faster development, switch to X11 temporarily:\n"; \
		printf "  Logout → Click gear at login → Select 'GNOME on Xorg'\n"; \
	else \
		printf "$(COLOR_SUCCESS)✓ You're on X11 - Press Alt+F2, type 'r', press Enter to reload.$(COLOR_RESET)\n"; \
	fi
	@printf "\n"
	@printf "$(COLOR_INFO)Useful commands:$(COLOR_RESET)\n"
	@printf "  make logs    - Watch extension output live\n"
	@printf "  make reload  - Reload GNOME Shell (X11) or show Wayland workaround\n"
	@printf "\n"

# Quick reinstall during development
reinstall: lint uninstall install
	@printf "$(COLOR_SUCCESS)✓ Extension reinstalled$(COLOR_RESET)\n"
	@printf "$(COLOR_WARN)⚠ Remember to reload GNOME Shell to see changes$(COLOR_RESET)\n"

# VM install target (renamed from vm-dev, no schema pre-compilation)
vm-install: lint
	@printf "$(COLOR_INFO)▶ Installing to VM...$(COLOR_RESET)\n"
	@./scripts/user/vm-install

# Deep clean targets with detailed diagnostics
clean-install:
	@./scripts/util/clean-install

vm-clean-install:
	@./scripts/util/vm-clean-install

# Test release package (interactive zip selection)
test-release:
	@printf "$(COLOR_INFO)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(COLOR_RESET)\n"
	@printf "$(COLOR_INFO)Test Release Package$(COLOR_RESET)\n"
	@printf "$(COLOR_INFO)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(COLOR_RESET)\n"
	@printf "\n$(COLOR_WARN)This will uninstall your current dev version!$(COLOR_RESET)\n\n"
	@# Find all zoned zip files
	@files=$$(find ~/Downloads build -name '*zoned*.zip' 2>/dev/null | sort -r); \
	if [ -z "$$files" ]; then \
		printf "$(COLOR_ERROR)✗ No zoned zip files found in ~/Downloads or build/$(COLOR_RESET)\n"; \
		printf "$(COLOR_INFO)Run 'make build' to create a local package$(COLOR_RESET)\n"; \
		exit 1; \
	fi; \
	printf "Select release package to test:\n\n"; \
	select zipfile in $$files "Cancel"; do \
		case $$zipfile in \
			"Cancel"|"") \
				printf "\n$(COLOR_INFO)Cancelled.$(COLOR_RESET)\n"; \
				exit 0 ;; \
			*) \
				printf "\n$(COLOR_INFO)Installing: $$zipfile$(COLOR_RESET)\n\n"; \
				$(MAKE) disable 2>/dev/null || true; \
				$(MAKE) uninstall 2>/dev/null || true; \
				gnome-extensions install "$$zipfile" --force; \
				gnome-extensions enable $(EXTENSION_UUID); \
				printf "\n$(COLOR_SUCCESS)✓ Release package installed and enabled$(COLOR_RESET)\n"; \
				printf "$(COLOR_INFO)Reload GNOME Shell to test (make reload or logout/login)$(COLOR_RESET)\n"; \
				break ;; \
		esac; \
	done
