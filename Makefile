.PHONY: help install uninstall enable disable reload logs compile-schema test clean zip \
        vm-init vm-network-setup vm-setup vm-install vm-logs vm-dev vm-restart-spice

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
	@printf "  make test           - Run tests\n"
	@printf "\n"
	@printf "$(COLOR_SUCCESS)VM Development:$(COLOR_RESET)\n"
	@printf "  make vm-network-setup  - Configure host networking for GNOME Boxes VMs\n"
	@printf "  make vm-init           - Initialize VM configuration (first-time setup)\n"
	@printf "  make vm-setup          - Configure VM for development (one-time)\n"
	@printf "  make vm-install        - Install/update extension in VM\n"
	@printf "  make vm-logs           - Watch extension logs from VM\n"
	@printf "  make vm-dev            - Quick VM development (install + reload)\n"
	@printf "  make vm-restart-spice  - Fix SPICE display connection issues\n"
	@printf "\n"
	@printf "$(COLOR_SUCCESS)Packaging:$(COLOR_RESET)\n"
	@printf "  make zip            - Create extension zip for distribution\n"
	@printf "  make clean          - Clean build artifacts\n"
	@printf "\n"

install:
	@printf "$(COLOR_INFO)Installing Zoned extension (production mode)...$(COLOR_RESET)\n"
	@mkdir -p $(INSTALL_DIR)
	@cp -r $(EXTENSION_DIR)/* $(INSTALL_DIR)/
	@$(SED_INPLACE) 's/^const DEBUG = .*/const DEBUG = false;/' $(INSTALL_DIR)/utils/debug.js
	@glib-compile-schemas $(INSTALL_DIR)/schemas/
	@printf "$(COLOR_SUCCESS)✓ Installation complete: $(INSTALL_DIR)$(COLOR_RESET)\n"
	@printf "$(COLOR_INFO)  DEBUG logging: disabled$(COLOR_RESET)\n"
	@printf "$(COLOR_SUCCESS)✓ Schema compiled$(COLOR_RESET)\n"

install-dev:
	@printf "$(COLOR_INFO)Installing Zoned extension (development mode)...$(COLOR_RESET)\n"
	@mkdir -p $(INSTALL_DIR)
	@cp -r $(EXTENSION_DIR)/* $(INSTALL_DIR)/
	@$(SED_INPLACE) 's/^const DEBUG = .*/const DEBUG = true;/' $(INSTALL_DIR)/utils/debug.js
	@glib-compile-schemas $(INSTALL_DIR)/schemas/
	@printf "$(COLOR_SUCCESS)✓ Installation complete: $(INSTALL_DIR)$(COLOR_RESET)\n"
	@printf "$(COLOR_INFO)  DEBUG logging: enabled$(COLOR_RESET)\n"
	@printf "$(COLOR_SUCCESS)✓ Schema compiled$(COLOR_RESET)\n"

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

clean:
	@printf "$(COLOR_INFO)Cleaning build artifacts...$(COLOR_RESET)\n"
	@rm -f *.zip
	@find . -name "*.gschema.compiled" -delete
	@rm -rf build/ dist/
	@printf "$(COLOR_SUCCESS)✓ Clean complete$(COLOR_RESET)\n"

zip:
	@printf "$(COLOR_INFO)Creating extension package (production)...$(COLOR_RESET)\n"
	@mkdir -p build/prod
	@cp -r $(EXTENSION_DIR)/* build/prod/
	@$(SED_INPLACE) 's/^const DEBUG = .*/const DEBUG = false;/' build/prod/utils/debug.js
	@cd build/prod && zip -r ../$(EXTENSION_UUID).zip . -x "*.git*"
	@printf "$(COLOR_SUCCESS)✓ Package created: build/$(EXTENSION_UUID).zip$(COLOR_RESET)\n"
	@printf "$(COLOR_INFO)  DEBUG logging: disabled (production build)$(COLOR_RESET)\n"

# Convenience target for development workflow
dev: install-dev compile-schema enable
	@printf "$(COLOR_SUCCESS)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(COLOR_RESET)\n"
	@printf "$(COLOR_SUCCESS)✓ Development setup complete!$(COLOR_RESET)\n"
	@printf "$(COLOR_SUCCESS)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(COLOR_RESET)\n"
	@printf "\n"
	@printf "$(COLOR_INFO)Extension installed, compiled, and enabled.$(COLOR_RESET)\n"
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
reinstall: uninstall install-dev compile-schema
	@printf "$(COLOR_SUCCESS)✓ Extension reinstalled$(COLOR_RESET)\n"
	@printf "$(COLOR_WARN)⚠ Remember to reload GNOME Shell to see changes$(COLOR_RESET)\n"

# VM Development targets
vm-network-setup:
	@printf "$(COLOR_INFO)Configuring host networking for VMs...$(COLOR_RESET)\n"
	@./scripts/vm-network-setup

vm-init:
	@printf "$(COLOR_INFO)Starting VM configuration wizard...$(COLOR_RESET)\n"
	@./scripts/init-vm-config

vm-setup:
	@printf "$(COLOR_INFO)Configuring VM for Zoned development...$(COLOR_RESET)\n"
	@./scripts/vm-setup

vm-install:
	@printf "$(COLOR_INFO)Installing extension to VM...$(COLOR_RESET)\n"
	@./scripts/vm-install

vm-logs:
	@printf "$(COLOR_INFO)Watching VM logs...$(COLOR_RESET)\n"
	@./scripts/vm-logs

vm-dev: vm-install
	@printf "$(COLOR_SUCCESS)✓ VM development cycle complete$(COLOR_RESET)\n"
	@printf "\n"
	@printf "$(COLOR_INFO)To see changes:$(COLOR_RESET)\n"
	@printf "  • X11 VM: Press Alt+F2 → type 'r' → Enter\n"
	@printf "  • Wayland VM: Log out and log back in\n"
	@printf "\n"
	@printf "$(COLOR_INFO)To watch logs:$(COLOR_RESET) make vm-logs\n"

vm-restart-spice:
	@printf "$(COLOR_INFO)Restarting SPICE services in VM...$(COLOR_RESET)\n"
	@./scripts/vm-restart-spice
