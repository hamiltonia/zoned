.PHONY: help install uninstall enable disable reload logs compile-schema test clean zip \
        vm-init vm-network-setup vm-setup vm-install vm-logs vm-dev vm-restart-spice \
        vm-stability-test vm-quick-test vm-long-haul vm-test-single vm-stop-test \
        vm-enable-debug vm-disable-debug lint lint-strict lint-fix dev reinstall

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
	@printf "  make lint           - Run ESLint on extension code\n"
	@printf "  make lint-fix       - Run ESLint and auto-fix issues\n"
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
	@printf "$(COLOR_SUCCESS)Stability Testing:$(COLOR_RESET)\n"
	@printf "  make vm-stability-test - Full test suite (~15-30 min, high iterations)\n"
	@printf "  make vm-quick-test     - Quick verification (~3-5 min, low iterations)\n"
	@printf "  make vm-long-haul DURATION=8h - Soak test: cycles through all tests repeatedly\n"
	@printf "                           tracking per-test memory to identify leaks\n"
	@printf "  make vm-test-single TEST=<name> - Run single test (e.g., window-movement)\n"
	@printf "  make vm-stop-test      - Kill any running test processes in VM\n"
	@printf "  make vm-enable-debug   - Enable debug features in VM\n"
	@printf "  make vm-disable-debug  - Disable debug features in VM\n"
	@printf "\n"
	@printf "$(COLOR_SUCCESS)Packaging:$(COLOR_RESET)\n"
	@printf "  make zip            - Create extension zip for distribution\n"
	@printf "  make clean          - Clean build artifacts\n"
	@printf "\n"

install:
	@printf "$(COLOR_INFO)Installing Zoned extension...$(COLOR_RESET)\n"
	@mkdir -p $(INSTALL_DIR)
	@cp -r $(EXTENSION_DIR)/* $(INSTALL_DIR)/
	@glib-compile-schemas $(INSTALL_DIR)/schemas/
	@printf "$(COLOR_SUCCESS)✓ Installation complete: $(INSTALL_DIR)$(COLOR_RESET)\n"
	@printf "$(COLOR_SUCCESS)✓ Schema compiled$(COLOR_RESET)\n"
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

clean:
	@printf "$(COLOR_INFO)Cleaning build artifacts...$(COLOR_RESET)\n"
	@rm -f *.zip
	@find . -name "*.gschema.compiled" -delete
	@rm -rf build/ dist/
	@printf "$(COLOR_SUCCESS)✓ Clean complete$(COLOR_RESET)\n"

zip: lint-strict
	@printf "$(COLOR_INFO)Creating extension package...$(COLOR_RESET)\n"
	@mkdir -p build/prod
	@cp -r $(EXTENSION_DIR)/* build/prod/
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

vm-dev: lint vm-install
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

# VM config file location
VM_CONFIG = $(HOME)/.config/zoned-dev/config

# VM Stability Testing targets
# Helper to find mount path in VM (similar to vm-install logic)
define VM_FIND_MOUNT
	MOUNT_PATH=""; \
	if ssh $${VM_USER}@$${VM_IP} "test -d $${VM_SPICE_MOUNT}" 2>/dev/null; then \
		MOUNT_PATH="$${VM_SPICE_MOUNT}"; \
	else \
		GVFS_MOUNT=$$(ssh $${VM_USER}@$${VM_IP} "find /run/user/1000/gvfs -maxdepth 1 -name 'dav*:*' -type d 2>/dev/null | head -n1" || echo ""); \
		if [ -n "$$GVFS_MOUNT" ]; then \
			if ssh $${VM_USER}@$${VM_IP} "test -d $$GVFS_MOUNT/zoned" 2>/dev/null; then \
				MOUNT_PATH="$$GVFS_MOUNT/zoned"; \
			else \
				MOUNT_PATH="$$GVFS_MOUNT"; \
			fi; \
		fi; \
	fi; \
	if [ -z "$$MOUNT_PATH" ]; then \
		printf "$(COLOR_ERROR)Shared folder not mounted in VM$(COLOR_RESET)\n"; \
		exit 1; \
	fi
endef

vm-stability-test:
	@printf "$(COLOR_INFO)Running full stability test suite in VM...$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CONFIG) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-init' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. $(VM_CONFIG) && $(VM_FIND_MOUNT) && ssh -t $${VM_USER}@$${VM_IP} "cd $$MOUNT_PATH && ./scripts/vm-test/run-all.sh"

vm-quick-test:
	@printf "$(COLOR_INFO)Running quick stability tests in VM...$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CONFIG) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-init' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. $(VM_CONFIG) && $(VM_FIND_MOUNT) && ssh -t $${VM_USER}@$${VM_IP} "cd $$MOUNT_PATH && ./scripts/vm-test/run-all.sh --quick"

# Default long haul duration (DURATION is alias for convenience)
LONG_HAUL_DURATION ?= 8h
ifdef DURATION
    LONG_HAUL_DURATION := $(DURATION)
endif

vm-long-haul:
	@printf "$(COLOR_INFO)Running long haul stability test in VM ($(LONG_HAUL_DURATION))...$(COLOR_RESET)\n"
	@printf "$(COLOR_WARN)This will run for $(LONG_HAUL_DURATION) - use Ctrl+C to stop early$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CONFIG) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-init' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. $(VM_CONFIG) && $(VM_FIND_MOUNT) && ssh -t $${VM_USER}@$${VM_IP} "cd $$MOUNT_PATH && ./scripts/vm-test/run-all.sh --long-haul $(LONG_HAUL_DURATION)"

vm-test-single:
	@if [ -z "$(TEST)" ]; then \
		printf "$(COLOR_ERROR)Usage: make vm-test-single TEST=<test-name>$(COLOR_RESET)\n"; \
		printf "$(COLOR_INFO)Available tests:$(COLOR_RESET)\n"; \
		printf "  enable-disable, ui-stress, zone-cycling, layout-switching\n"; \
		printf "  combined-stress, multi-monitor, window-movement, edge-cases, workspace\n"; \
		exit 1; \
	fi
	@printf "$(COLOR_INFO)Running single test '$(TEST)' in VM...$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CONFIG) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-init' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. $(VM_CONFIG) && $(VM_FIND_MOUNT) && ssh -t $${VM_USER}@$${VM_IP} "\
		cd $$MOUNT_PATH && \
		export DISPLAY=:0 && \
		export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus && \
		export GSETTINGS_SCHEMA_DIR=\$$HOME/.local/share/gnome-shell/extensions/zoned@hamiltonia.me/schemas && \
		echo 'Enabling debug features (triggers dynamic listener)...' && \
		gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true && \
		gsettings set org.gnome.shell.extensions.zoned debug-track-resources true && \
		echo 'Waiting for D-Bus interface...' && \
		for i in \$$(seq 1 20); do \
			if gdbus call -e -d org.gnome.Shell -o /org/gnome/Shell/Extensions/Zoned/Debug -m org.gnome.Shell.Extensions.Zoned.Debug.Ping >/dev/null 2>&1; then \
				echo 'D-Bus interface ready'; \
				break; \
			fi; \
			sleep 0.5; \
		done && \
		echo 'Running test...' && \
		./scripts/vm-test/test-$(TEST).sh 15"

vm-enable-debug:
	@printf "$(COLOR_INFO)Enabling debug features in VM...$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CONFIG) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-init' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. $(VM_CONFIG) && ssh $${VM_USER}@$${VM_IP} "gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true && \
	    gsettings set org.gnome.shell.extensions.zoned debug-track-resources true"
	@printf "$(COLOR_SUCCESS)✓ Debug features enabled in VM$(COLOR_RESET)\n"

vm-disable-debug:
	@printf "$(COLOR_INFO)Disabling debug features in VM...$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CONFIG) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-init' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. $(VM_CONFIG) && ssh $${VM_USER}@$${VM_IP} "gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus false && \
	    gsettings set org.gnome.shell.extensions.zoned debug-track-resources false"
	@printf "$(COLOR_SUCCESS)✓ Debug features disabled in VM$(COLOR_RESET)\n"

vm-stop-test:
	@printf "$(COLOR_INFO)Stopping any running test processes in VM...$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CONFIG) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-init' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. $(VM_CONFIG) && ssh $${VM_USER}@$${VM_IP} "\
		echo 'Looking for test processes...'; \
		PIDS=\"\$$(pgrep -f 'run-all.sh|test-.*\.sh' 2>/dev/null || true)\"; \
		if [ -n \"\$$PIDS\" ]; then \
			echo \"Killing test processes: \$$PIDS\"; \
			kill \$$PIDS 2>/dev/null || true; \
			sleep 1; \
			kill -9 \$$PIDS 2>/dev/null || true; \
			echo 'Test processes stopped'; \
		else \
			echo 'No test processes found'; \
		fi; \
		WINDOW_PID=\"\$$(pgrep -f 'test-window.py' 2>/dev/null || true)\"; \
		if [ -n \"\$$WINDOW_PID\" ]; then \
			echo \"Killing test window: \$$WINDOW_PID\"; \
			kill \$$WINDOW_PID 2>/dev/null || true; \
		fi; \
		echo 'Disabling debug features...'; \
		gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus false 2>/dev/null || true; \
		gsettings set org.gnome.shell.extensions.zoned debug-track-resources false 2>/dev/null || true"
	@printf "$(COLOR_SUCCESS)✓ Test cleanup complete$(COLOR_RESET)\n"
