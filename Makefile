.PHONY: help install uninstall enable disable reload logs compile-schema test clean build \
        vm-network-setup vm-setup vm-logs vm-dev vm-restart-spice \
        vm-start vm-headless vm-stop vm-stop-force vm-status vm-display vm-display-close \
        vm-virtiofs-migrate vm-delete \
        vm-stability-test vm-quick-test vm-long-haul vm-test-single vm-stop-test \
        vm-enable-debug vm-disable-debug \
        lint lint-strict lint-fix dev reinstall

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
	@printf "  make vm-start [VM=name] - Start VM with display (lists VMs if none specified)\n"
	@printf "  make vm-setup          - Full VM setup (run once per VM, or when things break)\n"
	@printf "  make vm-dev            - Fast deploy to VM (lint + compile + reload)\n"
	@printf "  make vm-logs           - Watch extension logs from VM\n"
	@printf "  make vm-restart-spice  - Fix SPICE display connection issues\n"
	@printf "  make vm-network-setup  - Configure host networking for GNOME Boxes VMs\n"
	@printf "\n"
	@printf "$(COLOR_SUCCESS)VM Headless Mode (for longhaul testing):$(COLOR_RESET)\n"
	@printf "  make vm-headless       - Start VM without display client (~500MB less memory)\n"
	@printf "  make vm-stop           - Gracefully stop VM\n"
	@printf "  make vm-stop-force     - Force stop VM immediately\n"
	@printf "  make vm-status         - Show VM status (running, SSH, display)\n"
	@printf "  make vm-display        - Attach display viewer to running VM\n"
	@printf "  make vm-display-close  - Close display viewer (return to headless)\n"
	@printf "\n"
	@printf "$(COLOR_SUCCESS)VM virtiofs Setup (faster file sharing):$(COLOR_RESET)\n"
	@printf "  make vm-virtiofs-migrate - Convert existing GNOME Boxes VM to use virtiofs\n"
	@printf "  make vm-delete VM=<name> - Delete VM and its disk image\n"
	@printf "\n"
	@printf "$(COLOR_SUCCESS)Stability Testing:$(COLOR_RESET)\n"
	@printf "  make vm-stability-test - Full test suite (~15-30 min, high iterations)\n"
	@printf "  make vm-quick-test     - Quick verification (~3-5 min, low iterations)\n"
	@printf "  make vm-longhaul       - Interactive menu for focused long tests\n"
	@printf "  make vm-longhaul-all DURATION=8h - Soak test: cycles through all tests repeatedly\n"
	@printf "                           tracking per-test memory to identify leaks\n"
	@printf "  make vm-analyze-tests  - Analyze latest test results and generate HTML report\n"
	@printf "  make vm-test-single TEST=<name> - Run single test (e.g., window-movement)\n"
	@printf "  make vm-stop-test      - Kill any running test processes in VM\n"
	@printf "  make vm-enable-debug   - Enable debug features in VM\n"
	@printf "  make vm-disable-debug  - Disable debug features in VM\n"
	@printf "\n"
	@printf "$(COLOR_SUCCESS)Build/Packaging:$(COLOR_RESET)\n"
	@printf "  make build          - Create extension zip for distribution\n"
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

# Build target (creates distributable zip)
build: lint-strict
	@printf "$(COLOR_INFO)Creating extension package...$(COLOR_RESET)\n"
	@mkdir -p build/prod
	@cp -r $(EXTENSION_DIR)/* build/prod/
	@cd build/prod && zip -r ../$(EXTENSION_UUID).zip . -x "*.git*"
	@printf "$(COLOR_SUCCESS)✓ Package created: build/$(EXTENSION_UUID).zip$(COLOR_RESET)\n"
	@printf "$(COLOR_INFO)  Note: Debug logging controlled via GSettings (default: disabled)$(COLOR_RESET)\n"

# Alias for backward compatibility
zip: build

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

vm-setup:
	@printf "$(COLOR_INFO)Running full VM setup...$(COLOR_RESET)\n"
	@./scripts/vm-setup

vm-logs:
	@printf "$(COLOR_INFO)Watching VM logs...$(COLOR_RESET)\n"
	@./scripts/vm-logs

vm-dev: lint
	@printf "$(COLOR_INFO)▶ Compiling schema locally...$(COLOR_RESET)\n"
	@glib-compile-schemas extension/schemas/
	@printf "$(COLOR_SUCCESS)✓ Schema compiled$(COLOR_RESET)\n"
	@./scripts/vm-dev

vm-restart-spice:
	@printf "$(COLOR_INFO)Restarting SPICE services in VM...$(COLOR_RESET)\n"
	@./scripts/vm-restart-spice

# VM cache file location (auto-generated by vm-setup)
VM_CACHE = .vm-cache

# Start VM with display (normal interactive use)
# Usage: make vm-start [VM=vmname]
vm-start:
	@VM_NAME="$(VM)"; \
	if [ -z "$$VM_NAME" ] && [ -r "$(VM_CACHE)" ]; then \
		VM_NAME=$$(grep VM_DOMAIN $(VM_CACHE) 2>/dev/null | cut -d= -f2 | tr -d '"'); \
	fi; \
	if [ -z "$$VM_NAME" ]; then \
		printf "$(COLOR_INFO)Available VMs:$(COLOR_RESET)\n"; \
		virsh -c qemu:///session list --all --name 2>/dev/null | grep -v '^$$' | while read vm; do \
			printf "  - $$vm\n"; \
		done; \
		printf "\n$(COLOR_WARN)Usage: make vm-start VM=<vmname>$(COLOR_RESET)\n"; \
		printf "$(COLOR_INFO)Or run 'make vm-setup' to configure a default VM.$(COLOR_RESET)\n"; \
		exit 1; \
	fi; \
	printf "$(COLOR_INFO)Starting VM '$$VM_NAME' with display...$(COLOR_RESET)\n"; \
	virsh -c qemu:///session start "$$VM_NAME" 2>/dev/null || true; \
	sleep 2; \
	virt-viewer -c qemu:///session --hotkeys=release-cursor=super+escape "$$VM_NAME" & \
	printf "$(COLOR_SUCCESS)✓ VM started with display$(COLOR_RESET)\n"

# VM Headless Mode targets (for longhaul testing with lower memory)
vm-headless:
	@./scripts/vm-headless start

vm-stop:
	@./scripts/vm-headless stop

vm-stop-force:
	@./scripts/vm-headless stop --force

vm-status:
	@./scripts/vm-headless status

vm-display:
	@./scripts/vm-headless display

vm-display-close:
	@./scripts/vm-headless display-close

# VM virtiofs Setup targets (faster file sharing than SPICE WebDAV)
vm-virtiofs-migrate:
	@./scripts/vm-virtiofs-migrate

# Delete VM and its disk image
# Usage: make vm-delete VM=<vmname>
vm-delete:
	@VM_NAME="$(VM)"; \
	if [ -z "$$VM_NAME" ]; then \
		printf "$(COLOR_ERROR)Usage: make vm-delete VM=<vmname>$(COLOR_RESET)\n"; \
		printf "$(COLOR_INFO)Available VMs:$(COLOR_RESET)\n"; \
		virsh -c qemu:///session list --all --name 2>/dev/null | grep -v '^$$' | while read vm; do \
			printf "  - $$vm\n"; \
		done; \
		exit 1; \
	fi; \
	if ! virsh -c qemu:///session dominfo "$$VM_NAME" &>/dev/null; then \
		printf "$(COLOR_ERROR)VM '$$VM_NAME' not found$(COLOR_RESET)\n"; \
		exit 1; \
	fi; \
	printf "$(COLOR_WARN)This will permanently delete VM '$$VM_NAME' and its disk image.$(COLOR_RESET)\n"; \
	printf "$(COLOR_WARN)Are you sure? [y/N]: $(COLOR_RESET)"; \
	read -r confirm; \
	if [ "$$confirm" != "y" ] && [ "$$confirm" != "Y" ]; then \
		printf "$(COLOR_INFO)Cancelled$(COLOR_RESET)\n"; \
		exit 0; \
	fi; \
	printf "$(COLOR_INFO)Stopping VM if running...$(COLOR_RESET)\n"; \
	virsh -c qemu:///session destroy "$$VM_NAME" 2>/dev/null || true; \
	printf "$(COLOR_INFO)Getting disk path...$(COLOR_RESET)\n"; \
	DISK_PATH=$$(virsh -c qemu:///session domblklist "$$VM_NAME" --details 2>/dev/null | grep disk | awk '{print $$4}' | head -1); \
	printf "$(COLOR_INFO)Undefining VM...$(COLOR_RESET)\n"; \
	virsh -c qemu:///session undefine "$$VM_NAME" --nvram 2>/dev/null || \
		virsh -c qemu:///session undefine "$$VM_NAME" 2>/dev/null; \
	if [ -n "$$DISK_PATH" ] && [ -f "$$DISK_PATH" ]; then \
		printf "$(COLOR_INFO)Removing disk image: $$DISK_PATH$(COLOR_RESET)\n"; \
		rm -f "$$DISK_PATH"; \
	fi; \
	printf "$(COLOR_SUCCESS)✓ VM '$$VM_NAME' deleted successfully$(COLOR_RESET)\n"

# VM Stability Testing targets
vm-stability-test:
	@printf "$(COLOR_INFO)Running full stability test suite in VM...$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CACHE) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-setup' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. ./$(VM_CACHE) && ssh $${VM_DOMAIN} "cd $${VM_MOUNT_PATH} && ./scripts/vm-test/run-all.sh"

vm-quick-test:
	@printf "$(COLOR_INFO)Running quick stability tests in VM...$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CACHE) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-setup' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. ./$(VM_CACHE) && ssh $${VM_DOMAIN} "cd $${VM_MOUNT_PATH} && ./scripts/vm-test/run-all.sh --quick"

vm-longhaul:
	@printf "$(COLOR_INFO)Starting interactive long-running test...$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CACHE) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-setup' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. ./$(VM_CACHE) && ssh -t $${VM_DOMAIN} "cd $${VM_MOUNT_PATH} && ./scripts/vm-test/longhaul-interactive.sh"

# Default long haul duration (DURATION is alias for convenience)
LONG_HAUL_DURATION ?= 8h
ifdef DURATION
    LONG_HAUL_DURATION := $(DURATION)
endif

vm-longhaul-all:
	@printf "$(COLOR_INFO)Running long haul stability test in VM ($(LONG_HAUL_DURATION))...$(COLOR_RESET)\n"
	@printf "$(COLOR_WARN)This will run for $(LONG_HAUL_DURATION) - use Ctrl+C to stop early$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CACHE) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-setup' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. ./$(VM_CACHE) && ssh $${VM_DOMAIN} "cd $${VM_MOUNT_PATH} && ./scripts/vm-test/run-all.sh --long-haul $(LONG_HAUL_DURATION)"

vm-test-single:
	@if [ -z "$(TEST)" ]; then \
		printf "$(COLOR_ERROR)Usage: make vm-test-single TEST=<test-name>$(COLOR_RESET)\n"; \
		printf "$(COLOR_INFO)Available tests:$(COLOR_RESET)\n"; \
		printf "  enable-disable, ui-stress, zone-cycling, layout-switching\n"; \
		printf "  combined-stress, multi-monitor, window-movement, edge-cases, workspace\n"; \
		exit 1; \
	fi
	@printf "$(COLOR_INFO)Running single test '$(TEST)' in VM...$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CACHE) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-setup' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. ./$(VM_CACHE) && ssh $${VM_DOMAIN} "\
		cd $${VM_MOUNT_PATH} && \
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
	@if [ ! -f $(VM_CACHE) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-setup' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. ./$(VM_CACHE) && ssh $${VM_DOMAIN} "gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus true && \
	    gsettings set org.gnome.shell.extensions.zoned debug-track-resources true"
	@printf "$(COLOR_SUCCESS)✓ Debug features enabled in VM$(COLOR_RESET)\n"

vm-disable-debug:
	@printf "$(COLOR_INFO)Disabling debug features in VM...$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CACHE) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-setup' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. ./$(VM_CACHE) && ssh $${VM_DOMAIN} "gsettings set org.gnome.shell.extensions.zoned debug-expose-dbus false && \
	    gsettings set org.gnome.shell.extensions.zoned debug-track-resources false"
	@printf "$(COLOR_SUCCESS)✓ Debug features disabled in VM$(COLOR_RESET)\n"

vm-stop-test:
	@printf "$(COLOR_INFO)Stopping any running test processes in VM...$(COLOR_RESET)\n"
	@if [ ! -f $(VM_CACHE) ]; then \
		printf "$(COLOR_ERROR)VM not configured. Run 'make vm-setup' first.$(COLOR_RESET)\n"; \
		exit 1; \
	fi
	@. ./$(VM_CACHE) && ssh $${VM_DOMAIN} "\
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

vm-analyze-tests:
	@printf "$(COLOR_INFO)Analyzing latest test results...$(COLOR_RESET)\n"
	@LATEST_MEMORY=$$(ls -t results/memory-*.csv 2>/dev/null | head -1); \
	LATEST_LONGHAUL=$$(ls -t results/longhaul-*.csv 2>/dev/null | head -1); \
	if [ -z "$$LATEST_MEMORY" ]; then \
		printf "$(COLOR_ERROR)No memory test results found in results/$(COLOR_RESET)\n"; \
		printf "$(COLOR_INFO)Run a test first: make vm-long-haul DURATION=3m$(COLOR_RESET)\n"; \
		exit 1; \
	fi; \
	printf "$(COLOR_INFO)Analyzing test data:$(COLOR_RESET)\n"; \
	printf "  Memory:   $$LATEST_MEMORY\n"; \
	if [ -n "$$LATEST_LONGHAUL" ]; then \
		printf "  Longhaul: $$LATEST_LONGHAUL\n"; \
	fi; \
	echo ""; \
	printf "$(COLOR_INFO)Checking Python dependencies...$(COLOR_RESET)\n"; \
	if ! python3 -c "import plotly, pandas" 2>/dev/null; then \
		printf "$(COLOR_WARN)Installing required Python packages...$(COLOR_RESET)\n"; \
		pip3 install --user plotly pandas || { \
			printf "$(COLOR_ERROR)Failed to install dependencies$(COLOR_RESET)\n"; \
			printf "$(COLOR_INFO)Install manually: pip3 install plotly pandas$(COLOR_RESET)\n"; \
			exit 1; \
		}; \
	fi; \
	printf "$(COLOR_INFO)Generating analysis report...$(COLOR_RESET)\n"; \
	REPORT=$$(python3 scripts/analyze-memory.py "$$LATEST_MEMORY" 2>&1 | grep "Open in browser" | awk '{print $$NF}'); \
	if [ -n "$$REPORT" ]; then \
		printf "$(COLOR_SUCCESS)✓ Analysis complete!$(COLOR_RESET)\n"; \
		printf "$(COLOR_INFO)Opening report in browser...$(COLOR_RESET)\n"; \
		xdg-open "$$REPORT" 2>/dev/null || open "$$REPORT" 2>/dev/null || { \
			printf "$(COLOR_INFO)Report: $$REPORT$(COLOR_RESET)\n"; \
		}; \
	else \
		printf "$(COLOR_ERROR)Analysis failed$(COLOR_RESET)\n"; \
		exit 1; \
	fi
